import { Telegraf, Context } from 'telegraf';
import Channel from '../../../models/Channel';

export async function handleChannelAdd(bot: Telegraf<Context>, b: any, ctx: Context, channelIdentifier: string | number) {
  try {
    const chat = await bot.telegram.getChat(channelIdentifier);
    const memberCount = await bot.telegram.getChatMembersCount(chat.id);
    if (memberCount < b.minMembers) return ctx.reply(`❌ القناة لا تستوفي الحد الأدنى (${b.minMembers}).`);
    const existing = await Channel.findOne({ botId: b._id, channelId: chat.id });
    if (existing) return ctx.reply('⚠️ القناة مضافة مسبقاً.');
    await Channel.create({ botId: b._id, ownerId: ctx.from!.id, channelId: chat.id, title: (chat as any).title, inviteLink: (chat as any).invite_link || `https://t.me/${(chat as any).username}`, memberCount: memberCount, isApproved: true });
    ctx.reply(`✅ تم قبول القناة: ${(chat as any).title}`);
    if ((b as any).notifyAdminChannel) {
      const adminMsg = `➕ قناة جديدة مضافة للقائمة: ${(chat as any).title}\n👥 الأعضاء: ${memberCount}`;
      if (b.adminGroupId) await bot.telegram.sendMessage(b.adminGroupId, adminMsg);
    }
  } catch (e) { ctx.reply('❌ تعذر التحقق.'); }
}

export async function handleUpdateChannels(bot: Telegraf<Context>, b: any, type: string) {
  const channels = await Channel.find({ botId: b._id });
  for (const ch of channels) {
    try {
      const chat = await bot.telegram.getChat(ch.channelId);
      if (type === 'names' || type === 'all') ch.title = (chat as any).title;
      if (type === 'members' || type === 'all') ch.memberCount = await bot.telegram.getChatMembersCount(ch.channelId);
      await ch.save();
    } catch (e) {}
  }
}