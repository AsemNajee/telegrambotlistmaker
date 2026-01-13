import { Context, Telegraf } from 'telegraf';
import Bot, { IBot } from '../models/Bot';
import Channel from '../models/Channel';

// استيراد المكونات المنظمة
import { getMainMenu } from './child/keyboards';
import { handlePublish, handleBump, handleDelete } from './child/actions/listActions';
import { handleSettingsCallbacks } from './child/callbacks/settingsCallbacks';
import { handleMessageEvent, handlePostEvent } from './child/events/messageEvents';

const userStates: Map<number, { action: string, data?: any }> = new Map();

export const setupChildBot = (bot: Telegraf<Context>, botData: IBot) => {
  
  const notifyAdmin = async (message: string) => {
    const b = await Bot.findById(botData._id);
    if (b?.adminGroupId) {
      try {
        await bot.telegram.sendMessage(b.adminGroupId, `🔔 إشعار إداري:\n${message}`);
      } catch (e) {}
    }
  };

  const showMainPanel = async (ctx: Context) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;
    const text = `👑 لوحة تحكم البوت: @${b.botUsername}\n\nاختر القسم الذي تريد إدارته من الأزرار أدناه:`;
    if (ctx.callbackQuery) await ctx.editMessageText(text, getMainMenu());
    else await ctx.reply(text, getMainMenu());
  };

  // --- Commands ---
  bot.start(showMainPanel);
  bot.command(['panel', 'control'], showMainPanel);

  bot.command('set_admin', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || b.ownerId !== ctx.from!.id) return;
    b.adminGroupId = ctx.chat!.id;
    await b.save();
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة للإدارة.');
  });

  bot.command('set_reception', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b || b.ownerId !== ctx.from!.id) return;
    b.receptionGroupId = ctx.chat!.id;
    await b.save();
    ctx.reply('✅ تم تعيين هذه المجموعة كمجموعة لاستقبال القنوات.');
  });

  // --- Callback Queries ---
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as any).data;
    const b = await Bot.findById(botData._id);
    if (!b) return;

    // معالجة العمليات المباشرة أولاً
    if (data === 'publish') return handlePublish(bot, b, ctx);
    if (data === 'bump_list') return handleBump(bot, b, ctx);
    if (data === 'delete') return handleDelete(bot, b, ctx);

    // تمرير باقي الاستعلامات لمعالج الإعدادات
    return handleSettingsCallbacks(ctx, botData._id as any, userStates);
  });

  // --- Events ---
  bot.on('channel_post', (ctx) => handlePostEvent(bot, ctx, botData._id as any));

  bot.on('my_chat_member', async (ctx) => {
    const b = await Bot.findById(botData._id);
    if (!b) return;
    if (ctx.myChatMember.new_chat_member.status === 'administrator') {
      if ((b as any).notifyAdminBot) await notifyAdmin(`🤖 تم إضافة البوت كمسؤول في قناة جديدة.`);
    }
    if (b.isProtectionEnabled && (ctx.myChatMember.new_chat_member.status === 'left' || ctx.myChatMember.new_chat_member.status === 'kicked')) {
      const channel = await Channel.findOne({ botId: b._id, channelId: ctx.chat!.id });
      if (channel) {
        await notifyAdmin(`⚠️ تم طرد البوت من قناة: ${channel.title}`);
        if ((b as any).autoRepublishOnDelete) await handleBump(bot, b, ctx);
        await channel.deleteOne();
      }
    }
  });

  bot.on('message', (ctx, next) => handleMessageEvent(bot, ctx, botData._id as any, userStates).then(() => next()));
};