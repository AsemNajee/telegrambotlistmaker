import { Context, Telegraf } from 'telegraf';
import Bot from '../../../models/Bot';
import Channel from '../../../models/Channel';
import { handleChannelAdd } from '../actions/channelActions';
import { sendList } from '../actions/listActions';
import { getMainMenu } from '../keyboards';

export const handleMessageEvent = async (bot: Telegraf<Context>, ctx: Context, botId: string, userStates: Map<number, any>) => {
  const b = await Bot.findById(botId);
  if (!b) return;
  const msg = ctx.message as any;

  // Reception Logic
  if (b.isReceptionEnabled && (ctx.chat!.id === b.receptionGroupId || ctx.chat!.type === 'private')) {
    if (msg.forward_from_chat && msg.forward_from_chat.type === 'channel') return handleChannelAdd(bot, b, ctx, msg.forward_from_chat.id);
    const text = msg.text || msg.caption || '';
    const channelMatch = text.match(/t\.me\/([a-zA-Z0-9_]{5,})/);
    if (channelMatch) return handleChannelAdd(bot, b, ctx, `@${channelMatch[1]}`);
  }

  // State-based Logic
  const state = userStates.get(ctx.from!.id);
  if (state?.action === 'awaiting_head') {
    b.publishMessage = msg.text || msg.caption || '';
    if (msg.photo) b.publishMedia = { fileId: msg.photo[msg.photo.length - 1].file_id, type: 'photo' };
    else if (msg.video) b.publishMedia = { fileId: msg.video.file_id, type: 'video' };
    else if (msg.animation) b.publishMedia = { fileId: msg.animation.file_id, type: 'animation' };
    else b.publishMedia = undefined;
    await b.save();
    userStates.delete(ctx.from!.id);
    ctx.reply('✅ تم تحديث الرأس. معاينة:');
    const channels = await Channel.find({ botId: b._id, isApproved: true }).limit(5);
    return sendList(bot, ctx.chat!.id, b, channels, true);
  }
  
  if (state?.action === 'edit_template') {
    if (msg.text) { 
      b.nameTemplate = msg.text; 
      await b.save(); 
      userStates.delete(ctx.from!.id); 
      return ctx.reply('✅ تم تحديث التنسيق.', getMainMenu()); 
    }
  }
};

export const handlePostEvent = async (bot: Telegraf<Context>, ctx: Context, botId: string) => {
  const b = await Bot.findById(botId);
  if (!b || !b.isAutoBumpEnabled) return;
  const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat!.id });
  if (!channel || !channel.lastMessageId) return;
  
  channel.newPostsCount = (channel.newPostsCount || 0) + 1;
  if (channel.newPostsCount >= (b.bumpThreshold || 5)) {
    try {
      await bot.telegram.deleteMessage(ctx.chat!.id, channel.lastMessageId);
      const allApproved = await Channel.find({ botId: b._id, isApproved: true });
      const sent = await sendList(bot, ctx.chat!.id, b, allApproved);
      channel.lastMessageId = sent.message_id;
      channel.newPostsCount = 0;
    } catch (e) {}
  }
  await channel.save();
};