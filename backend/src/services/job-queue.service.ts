/**
 * AI 流水线并发控制与任务队列
 *
 * 设计目标：
 * - 本地优先：零外部依赖（无 Redis/BullMQ），纯内存实现
 * - 并发控制：可配置最大并发数，防止 AI API 过载
 * - FIFO 队列：先到先服务，支持优先级（短文本优先）
 * - 速率限制：令牌桶算法，防止 API 限流
 * - 状态可观测：SSE 推送队列位置 + 执行进度
 * - 优雅降级：超时自动取消、失败自动重试、服务器关闭时清理
 */

import type { PipelineProgress } from "./ai.service";

// ─── 类型定义 ──────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface QueueJob {
  id: string;
  novelId: string;
  novelTitle: string;
  type: "analyze" | "generate-scripts" | "pipeline" | "incremental-pipeline";
  priority: number;       // 越小越优先（短文本优先）
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  progress: PipelineProgress | null;
  error: string | null;
  result: any | null;
  /** 执行函数 */
  executor: ((onProgress: (p: PipelineProgress) => void) => Promise<any>) | null;
  /** SSE 客户端列表 */
  sseClients: Set<(event: string, data: string) => void>;
  /** 超时计时器 */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export interface QueueStatus {
  active: QueueJob[];
  pending: QueueJob[];
  maxConcurrency: number;
  totalQueued: number;
  totalCompleted: number;
  totalFailed: number;
  rateLimitRemaining: number;
}

export interface QueueConfig {
  maxConcurrency: number;       // 最大并发 AI 任务数（默认 2）
  jobTimeoutMs: number;         // 单个任务超时（默认 10 分钟）
  maxQueueSize: number;         // 最大排队数（默认 20）
  rateLimitPerMinute: number;   // 每分钟最大 API 调用数（默认 10）
  rateLimitBurst: number;       // 突发容量（默认 3）
}

// ─── 默认配置 ──────────────────────────────────────────────

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrency: 2,
  jobTimeoutMs: 10 * 60 * 1000,   // 10 分钟
  maxQueueSize: 20,
  rateLimitPerMinute: 10,
  rateLimitBurst: 3,
};

// ─── 令牌桶速率限制器 ──────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;     // tokens per ms
  private lastRefill: number;

  constructor(maxTokens: number, perMinute: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = perMinute / 60000; // per minute → per ms
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /** 尝试消费 1 个令牌。成功返回 true，失败返回 false */
  consume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** 获取剩余令牌数 */
  remaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /** 等待直到有可用令牌 */
  async waitForToken(): Promise<void> {
    while (!this.consume()) {
      // 计算需要等待的时间
      this.refill();
      if (this.tokens >= 1) continue;
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate) + 10;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
    }
  }
}

// ─── 任务队列管理器 ────────────────────────────────────────

class JobQueueService {
  private config: QueueConfig;
  private pending: QueueJob[] = [];
  private active: QueueJob[] = [];
  private completed: QueueJob[] = [];
  private failed: QueueJob[] = [];
  private totalCompleted = 0;
  private totalFailed = 0;
  private jobCounter = 0;
  private tokenBucket: TokenBucket;
  private isShuttingDown = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenBucket = new TokenBucket(
      this.config.rateLimitBurst,
      this.config.rateLimitPerMinute
    );

    // 优雅关闭
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  // ─── 公共 API ─────────────────────────────────────────

  /** 提交任务到队列 */
  enqueue(
    novelId: string,
    novelTitle: string,
    type: QueueJob["type"],
    executor: (onProgress: (p: PipelineProgress) => void) => Promise<any>,
    options?: { priority?: number }
  ): { jobId: string; position: number; status: JobStatus } {
    if (this.isShuttingDown) {
      throw new Error("服务器正在关闭，不接受新任务");
    }

    if (this.pending.length + this.active.length >= this.config.maxQueueSize) {
      throw new Error(
        `任务队列已满（最多 ${this.config.maxQueueSize} 个任务）。请等待当前任务完成后再提交。\n` +
        `当前: ${this.active.length} 个执行中, ${this.pending.length} 个排队中`
      );
    }

    // 去重：同一小说的同类型任务已在队列中则拒绝
    const duplicate = [...this.active, ...this.pending].find(
      (j) => j.novelId === novelId && j.type === type
    );
    if (duplicate) {
      throw new Error(
        `该小说已有同类型任务在进行中（状态: ${duplicate.status === "running" ? "执行中" : "排队中"}）`
      );
    }

    const id = `job_${Date.now()}_${++this.jobCounter}`;
    const job: QueueJob = {
      id,
      novelId,
      novelTitle,
      type,
      priority: options?.priority ?? this.calculatePriority(type),
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      progress: null,
      error: null,
      result: null,
      executor,
      sseClients: new Set(),
      timeoutTimer: null,
    };

    // 按优先级插入（小值优先）+ 同优先级按 FIFO
    const insertIdx = this.pending.findIndex((j) => j.priority > job.priority);
    if (insertIdx === -1) {
      this.pending.push(job);
    } else {
      this.pending.splice(insertIdx, 0, job);
    }

    const position = this.pending.indexOf(job) + 1;

    console.log(
      `📥 [Queue] 新任务 ${id}: ${type} 「${novelTitle}」| 排队位置 #${position} | 活跃:${this.active.length} 等待:${this.pending.length}`
    );

    // 广播队列状态更新
    this.broadcastQueueUpdate();

    // 尝试立即执行
    this.processNext();

    return { jobId: id, position, status: "queued" };
  }

  /** 获取队列状态 */
  getStatus(): QueueStatus {
    return {
      active: this.sanitizeJobs(this.active),
      pending: this.sanitizeJobs(this.pending),
      maxConcurrency: this.config.maxConcurrency,
      totalQueued: this.pending.length,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      rateLimitRemaining: this.tokenBucket.remaining(),
    };
  }

  /** 根据 jobId 获取任务状态 */
  getJob(jobId: string): QueueJob | null {
    for (const list of [this.active, this.pending, this.completed, this.failed]) {
      const job = list.find((j) => j.id === jobId);
      if (job) return { ...job };
    }
    return null;
  }

  /** 订阅任务 SSE 事件 */
  subscribeJob(
    jobId: string,
    onEvent: (event: string, data: string) => void
  ): () => void {
    const job =
      this.active.find((j) => j.id === jobId) ||
      this.pending.find((j) => j.id === jobId);

    if (job) {
      job.sseClients.add(onEvent);

      // 立即推送当前状态
      if (job.status === "queued") {
        const position = this.getQueuePosition(jobId);
        onEvent("queue_update", JSON.stringify({ status: "queued", position }));
      } else if (job.progress) {
        onEvent("progress", JSON.stringify(job.progress));
      }
    }

    return () => {
      // 返回取消订阅函数
      const found =
        this.active.find((j) => j.id === jobId) ||
        this.pending.find((j) => j.id === jobId);
      if (found) {
        found.sseClients.delete(onEvent);
      }
    };
  }

  /** 取消任务 */
  cancelJob(jobId: string): boolean {
    const idx = this.pending.findIndex((j) => j.id === jobId);
    if (idx !== -1) {
      const job = this.pending[idx];
      job.status = "cancelled";
      job.finishedAt = Date.now();
      this.pending.splice(idx, 1);
      this.sendJobEvent(job, "cancelled", JSON.stringify({ jobId }));
      console.log(`🚫 [Queue] 取消排队任务: ${jobId}`);
      this.broadcastQueueUpdate();
      return true;
    }

    // 正在执行的任务不能直接取消（会被超时机制处理）
    const activeJob = this.active.find((j) => j.id === jobId);
    if (activeJob) {
      console.log(`⚠️ [Queue] 无法取消正在执行的任务: ${jobId}`);
      return false;
    }

    return false;
  }

  /** 更新配置 */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
    // 尝试启动更多 worker
    this.processNext();
  }

  // ─── 内部方法 ─────────────────────────────────────────

  private calculatePriority(type: QueueJob["type"]): number {
    // 分析类任务权重更低（优先执行），因为它们是后续步骤的前置依赖
    const weights: Record<string, number> = {
      analyze: 1,
      pipeline: 2,
      "generate-scripts": 3,
      "incremental-pipeline": 4,
    };
    return weights[type] || 5;
  }

  private getQueuePosition(jobId: string): number {
    const idx = this.pending.findIndex((j) => j.id === jobId);
    return idx === -1 ? 0 : idx + this.active.length + 1;
  }

  /** 尝试从等待队列中取出下一个任务执行 */
  private processNext(): void {
    if (this.isShuttingDown) return;

    while (
      this.active.length < this.config.maxConcurrency &&
      this.pending.length > 0
    ) {
      const job = this.pending.shift()!;
      this.startJob(job);
    }
  }

  /** 启动单个任务 */
  private async startJob(job: QueueJob): Promise<void> {
    job.status = "running";
    job.startedAt = Date.now();
    this.active.push(job);

    console.log(
      `🚀 [Queue] 开始执行 ${job.id}: ${job.type} 「${job.novelTitle}」| 活跃:${this.active.length}/${this.config.maxConcurrency}`
    );

    this.sendJobEvent(job, "started", JSON.stringify({ jobId: job.id }));
    this.broadcastQueueUpdate();

    // 超时保护
    job.timeoutTimer = setTimeout(() => {
      console.log(`⏰ [Queue] 任务超时: ${job.id}`);
      this.failJob(job, "任务执行超时（超过 10 分钟）");
    }, this.config.jobTimeoutMs);

    try {
      // 等待速率限制令牌
      await this.tokenBucket.waitForToken();

      // 执行任务
      const result = await job.executor!((progress) => {
        job.progress = progress;
        // 推送进度给所有 SSE 客户端
        this.sendJobEvent(job, "progress", JSON.stringify(progress));
        // 也广播队列更新（可能影响速率限制信息）
        this.broadcastQueueUpdate();
      });

      // 成功
      this.completeJob(job, result);
    } catch (err: any) {
      this.failJob(job, err.message || "未知错误");
    }
  }

  private completeJob(job: QueueJob, result: any): void {
    if (job.timeoutTimer) clearTimeout(job.timeoutTimer);

    job.status = "completed";
    job.finishedAt = Date.now();
    job.result = result;

    // 从 active 移到 completed
    const idx = this.active.indexOf(job);
    if (idx !== -1) this.active.splice(idx, 1);

    this.totalCompleted++;
    // 仅保留最近 50 个已完成任务
    this.completed.push(job);
    if (this.completed.length > 50) this.completed.shift();

    const duration = ((job.finishedAt - job.startedAt!) / 1000).toFixed(1);
    console.log(
      `✅ [Queue] 完成 ${job.id}: ${job.type} 「${job.novelTitle}」| 耗时 ${duration}s`
    );

    this.sendJobEvent(job, "completed", JSON.stringify({ jobId: job.id, result }));
    this.broadcastQueueUpdate();

    // 处理下一个
    this.processNext();
  }

  private failJob(job: QueueJob, error: string): void {
    if (job.timeoutTimer) clearTimeout(job.timeoutTimer);

    job.status = "failed";
    job.finishedAt = Date.now();
    job.error = error;

    const idx = this.active.indexOf(job);
    if (idx !== -1) this.active.splice(idx, 1);

    this.totalFailed++;
    this.failed.push(job);
    if (this.failed.length > 50) this.failed.shift();

    console.error(`❌ [Queue] 失败 ${job.id}: ${error}`);

    this.sendJobEvent(
      job,
      "failed",
      JSON.stringify({ jobId: job.id, error })
    );
    this.broadcastQueueUpdate();

    // 处理下一个
    this.processNext();
  }

  /** 向任务的所有 SSE 客户端发送事件 */
  private sendJobEvent(job: QueueJob, event: string, data: string): void {
    for (const client of job.sseClients) {
      try {
        client(event, data);
      } catch {
        // 客户端可能已断开
        job.sseClients.delete(client);
      }
    }
  }

  /** 向全局队列监听器广播更新 */
  private broadcastQueueUpdate(): void {
    // 由 SSE 端点自行轮询 getStatus()
    // 这里我们使用一个简单的发布-订阅模式
    for (const listener of globalListeners) {
      try {
        listener("queue_status", JSON.stringify(this.getStatus()));
      } catch {
        globalListeners.delete(listener);
      }
    }
  }

  /** 订阅全局队列状态更新 */
  subscribeQueue(
    onEvent: (event: string, data: string) => void
  ): () => void {
    globalListeners.add(onEvent);
    // 立即推送当前状态
    onEvent("queue_status", JSON.stringify(this.getStatus()));
    return () => globalListeners.delete(onEvent);
  }

  /** 清理敏感数据后的任务列表 */
  private sanitizeJobs(jobs: QueueJob[]): QueueJob[] {
    return jobs.map((j) => ({
      ...j,
      executor: null,
      sseClients: new Set(),
      timeoutTimer: null,
      result: j.status === "completed" ? "ok" : null,
    })) as QueueJob[];
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    console.log(
      `🛑 [Queue] 正在关闭... 活跃:${this.active.length} 等待:${this.pending.length}`
    );

    // 取消所有等待中的任务
    for (const job of this.pending) {
      job.status = "cancelled";
      job.finishedAt = Date.now();
      this.sendJobEvent(job, "cancelled", JSON.stringify({ jobId: job.id }));
    }
    this.pending = [];

    // 等待活跃任务完成（最多 30 秒）
    if (this.active.length > 0) {
      console.log(`⏳ [Queue] 等待 ${this.active.length} 个活跃任务完成...`);
      await Promise.race([
        Promise.all(
          this.active.map(
            (j) =>
              new Promise<void>((resolve) => {
                const check = setInterval(() => {
                  if (this.active.indexOf(j) === -1) {
                    clearInterval(check);
                    resolve();
                  }
                }, 500);
              })
          )
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 30000)),
      ]);
    }

    console.log("👋 [Queue] 队列已关闭");
  }
}

// ─── 全局监听器 ──────────────────────────────────────────

const globalListeners = new Set<(event: string, data: string) => void>();

// ─── 单例导出 ────────────────────────────────────────────

export const jobQueue = new JobQueueService({
  maxConcurrency: parseInt(process.env.QUEUE_MAX_CONCURRENCY || "2", 10),
  jobTimeoutMs: parseInt(process.env.QUEUE_JOB_TIMEOUT_MS || "600000", 10),
  maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE || "20", 10),
  rateLimitPerMinute: parseInt(process.env.QUEUE_RATE_LIMIT || "10", 10),
  rateLimitBurst: parseInt(process.env.QUEUE_RATE_BURST || "3", 10),
});

export default jobQueue;
