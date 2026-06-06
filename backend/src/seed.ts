import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_NOVEL = {
  title: "示例：青云剑仙",
  content: `第一章 少年剑客

江南三月，烟雨朦胧。

林风背着师父赠予的青钢剑，踏上了前往青云山的路。这是他十八年来第一次离开家乡，心中既有对未知世界的向往，也有一丝不为人知的忐忑。

他的师父——江湖人称「铁剑先生」的沈青云——曾语重心长地说：「江湖险恶，人心叵测。但真正的剑客，从不畏惧黑暗。」

林风始终相信，只要心存正义，便能无所畏惧。

行至半山腰，忽然林中传来兵刃交击之声。

林风循声望去，只见三名黑衣人正在围攻一名白衣女子。女子剑法飘逸，剑光如雪，但以一敌三，已露败象。

林风不及多想，拔出青钢剑，大喝一声冲了上去。

「来者何人！」为首的黑衣人厉声喝道。

「路见不平之人！」林风剑锋一抖，数点寒芒刺向黑衣人。

白衣女子趁势后退，靠在古树旁喘息。她抬眼看向林风，眸中闪过一丝惊讶——这个少年剑客的剑法，竟有几分眼熟。

第二章 神秘身份

黑衣人败退后，白衣女子向林风行礼道谢。

「多谢少侠相救，小女子白露，敢问少侠尊姓大名？」

「在下林风，奉师命前往青云山。」林风拱手回礼。

白露闻言，神色微变：「青云山？你可是「铁剑先生」的弟子？」

林风一愣：「姑娘认识家师？」

白露微微一笑，却不作答，反而说道：「前方有一处客栈，不如我们边歇息边谈。我此行也是前往青云山，若少侠不嫌弃，可结伴同行。」

林风心中虽有些疑惑，但见白露谈吐不凡，便点头应允。

两人来到山脚下的「云来客栈」，白露要了一壶清茶，这才缓缓道出真相。

原来，白露并非普通江湖女子，而是青云山掌门之女。因其父遭人暗算，生命垂危，她此次下山是为寻找能解奇毒的神医「药王谷」谷主。`,
};

async function main() {
  // 清空旧数据
  await prisma.script.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.character.deleteMany();
  await prisma.novel.deleteMany();
  console.log("已清空旧数据");

  // 插入示例
  const novel = await prisma.novel.create({
    data: {
      title: SAMPLE_NOVEL.title,
      content: SAMPLE_NOVEL.content,
    },
  });

  console.log(`✅ 已创建示例小说:`);
  console.log(`   ID: ${novel.id}`);
  console.log(`   标题: ${novel.title}`);
  console.log(`   字数: ${novel.content.length}`);
  console.log(`   预览: ${novel.content.substring(0, 50)}...`);

  await prisma.$disconnect();
}

main();
