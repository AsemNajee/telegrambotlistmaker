import { Telegraf, Context, Markup } from 'telegraf';
import Channel from '../../../models/Channel';

export async function sendList(bot: Telegraf<Context>, chatId: number, b: any, channels: any[], isPreview = false) {
  const textList = channels.map(ch => {
    let title = ch.title;
    if ((b as any).cleanNames) title = title.replace(/[^\w\s\u0600-\u06FF]/gi, '').trim();
    const name = b.nameTemplate.replace('{Name}', title).replace('{Nb}', ch.memberCount.toString());
    return b.listType === 'text' ? `• [${name}](${ch.inviteLink})` : name;
  });
  const extra: any = { parse_mode: 'Markdown', link_preview_options: { is_disabled: !b.isPreviewEnabled, prefer_small_media: true, show_above_text: (b as any).previewPosition === 'top' } };
  if (b.listType === 'buttons') {
    const buttons = textList.map((name, i) => Markup.button.url(name, channels[i].inviteLink));
    const rows = [];
    for (let i = 0; i < buttons.length; i += b.columnsCount) rows.push(buttons.slice(i, i + b.columnsCount));
    extra.reply_markup = Markup.inlineKeyboard(rows).reply_markup;
  }
  const content = b.listType === 'text' ? `${b.publishMessage}\n\n${textList.join('\n')}` : b.publishMessage;
  if (b.publishMedia) {
    const { fileId, type } = b.publishMedia;
    if (type === 'photo') return await bot.telegram.sendPhoto(chatId, fileId, { caption: content, ...extra });
    if (type === 'video') return await bot.telegram.sendVideo(chatId, fileId, { caption: content, ...extra });
    if (type === 'animation') return await bot.telegram.sendAnimation(chatId, fileId, { caption: content, ...extra });
  }
  return await bot.telegram.sendMessage(chatId, content, extra);
}

export async function handlePublish(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, isApproved: true });
  if (channels.length === 0) return ctx.reply('❌ لا توجد قنوات.');
  
  if (b.sortType === 'members_desc') channels.sort((a, b) => b.memberCount - a.memberCount);
  else if (b.sortType === 'members_asc') channels.sort((a, b) => a.memberCount - b.memberCount);
  else if (b.sortType === 'name_asc') channels.sort((a, b) => a.title.localeCompare(b.title));
  else if (b.sortType === 'name_desc') channels.sort((a, b) => b.title.localeCompare(a.title));
  else if (b.sortType === 'date_desc') channels.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  else if (b.sortType === 'date_asc') channels.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const ch of channels) {
    try {
      const sent = await sendList(bot, ch.channelId, b, channels);
      await Channel.findByIdAndUpdate(ch._id, { lastMessageId: sent.message_id, initialMemberCount: ch.memberCount });
    } catch (e) {}
  }
  ctx.reply('✅ تم النشر.');
}

export async function handleBump(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  const allApproved = await Channel.find({ botId: b._id, isApproved: true });
  for (const ch of channels) {
    try {
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      const sent = await sendList(bot, ch.channelId, b, allApproved);
      ch.lastMessageId = sent.message_id;
      await ch.save();
    } catch (e) {}
  }
  if (ctx.callbackQuery) ctx.reply('🚀 تم الرفع.');
}

export async function handleDelete(bot: Telegraf<Context>, b: any, ctx: Context) {
  const channels = await Channel.find({ botId: b._id, lastMessageId: { $exists: true } });
  let report = '📊 تقرير زيادة الأعضاء:\n\n';
  for (const ch of channels) {
    try {
      const currentCount = await bot.telegram.getChatMembersCount(ch.channelId);
      const increase = currentCount - (ch.initialMemberCount || ch.memberCount);
      report += `• ${ch.title}: +${increase} عضو\n`;
      await bot.telegram.deleteMessage(ch.channelId, ch.lastMessageId!);
      await Channel.findByIdAndUpdate(ch._id, { $unset: { lastMessageId: "", initialMemberCount: "" } });
    } catch (e) {}
  }
  ctx.reply(report);
  ctx.reply('🗑 تم الحذف.');
}