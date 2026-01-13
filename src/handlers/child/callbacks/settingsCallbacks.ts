import { Context, Markup } from 'telegraf';
import Bot, { IBot } from '../../../models/Bot';
import Channel from '../../../models/Channel';
import { getMainMenu, getListSettingsMenu, getReceptionMenu, getWatchMenu } from '../keyboards';
import { handlePublish, handleBump, handleDelete, sendList } from '../actions/listActions';
import { handleUpdateChannels } from '../actions/channelActions';
import path from 'path';
import fs from 'fs';

export const handleSettingsCallbacks = async (ctx: Context, botId: string, userStates: Map<number, any>) => {
  const data = (ctx.callbackQuery as any).data;
  const b = await Bot.findById(botId);
  if (!b) return;

  if (data === 'menu_list') return ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
  if (data === 'menu_reception') return ctx.editMessageText('📥 إعدادات الاستقبال:', getReceptionMenu(b));
  if (data === 'menu_watch') return ctx.editMessageText('👀 مراقبة القنوات والرفع التلقائي:', getWatchMenu(b));
  if (data === 'back_main') {
    const text = `👑 لوحة تحكم البوت: @${b.botUsername}\n\nاختر القسم الذي تريد إدارته من الأزرار أدناه:`;
    return ctx.editMessageText(text, getMainMenu());
  }

  // Toggles
  if (data === 'toggle_preview') { b.isPreviewEnabled = !b.isPreviewEnabled; await b.save(); return ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
  if (data === 'toggle_list_type') { b.listType = b.listType === 'buttons' ? 'text' : 'buttons'; await b.save(); return ctx.editMessageReplyMarkup(getListSettingsMenu(b).reply_markup); }
  if (data === 'toggle_reception') { b.isReceptionEnabled = !b.isReceptionEnabled; await b.save(); return ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
  if (data === 'toggle_private') { b.isPrivateReceptionEnabled = !b.isPrivateReceptionEnabled; await b.save(); return ctx.editMessageReplyMarkup(getReceptionMenu(b).reply_markup); }
  if (data === 'toggle_auto_bump') { b.isAutoBumpEnabled = !b.isAutoBumpEnabled; await b.save(); return ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
  if (data === 'toggle_protection') { b.isProtectionEnabled = !b.isProtectionEnabled; await b.save(); return ctx.editMessageReplyMarkup(getWatchMenu(b).reply_markup); }
  if (data === 'toggle_clean_names') { (b as any).cleanNames = !(b as any).cleanNames; await b.save(); return ctx.editMessageReplyMarkup((ctx.callbackQuery as any).message.reply_markup); }

  // Submenus & Actions
  if (data === 'menu_cols') {
    return ctx.editMessageText('🔢 اختر عدد الأعمدة:', Markup.inlineKeyboard([
      [Markup.button.callback('1 عمود', 'set_col_1'), Markup.button.callback('2 عمودين', 'set_col_2'), Markup.button.callback('3 أعمدة', 'set_col_3')],
      [Markup.button.callback('🔙 عودة', 'menu_list')]
    ]));
  }
  if (data.startsWith('set_col_')) {
    b.columnsCount = parseInt(data.split('_')[2]);
    await b.save();
    return ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
  }
  
  if (data === 'menu_order') {
    return ctx.editMessageText('⚖️ إعدادات الترتيب:', Markup.inlineKeyboard([
      [Markup.button.callback('🔤 الاسم (A-Z)', 'order_name_asc'), Markup.button.callback('🔤 الاسم (Z-A)', 'order_name_desc')],
      [Markup.button.callback('👥 الأعضاء (الأكثر)', 'order_members_desc'), Markup.button.callback('👥 الأعضاء (الأقل)', 'order_members_asc')],
      [Markup.button.callback('📅 التاريخ (الأحدث)', 'order_date_desc'), Markup.button.callback('📅 التاريخ (الأقدم)', 'order_date_asc')],
      [Markup.button.callback('🔙 عودة', 'menu_list')]
    ]));
  }
  if (data.startsWith('order_')) {
    b.sortType = data.replace('order_', '') as any;
    await b.save();
    ctx.answerCbQuery('تم تحديث الترتيب');
    return ctx.editMessageText('📜 إعدادات القائمة:', getListSettingsMenu(b));
  }

  if (data === 'menu_min_members') {
    return ctx.editMessageText(`👥 الحد الأدنى الحالي: ${b.minMembers}\nاستخدم الأزرار للزيادة أو النقصان:`, Markup.inlineKeyboard([
      [Markup.button.callback('+1', 'min_+1'), Markup.button.callback('+10', 'min_+10'), Markup.button.callback('+100', 'min_+100'), Markup.button.callback('+1k', 'min_+1000'), Markup.button.callback('+10K', 'min_+10000')],
      [Markup.button.callback('-1', 'min_-1'), Markup.button.callback('-10', 'min_-10'), Markup.button.callback('-100', 'min_-100'), Markup.button.callback('-1k', 'min_-1000'), Markup.button.callback('-10K', 'min_-10000')],
      [Markup.button.callback('🔙 عودة', 'menu_reception')]
    ]));
  }
  if (data.startsWith('min_')) {
    const val = parseInt(data.split('_')[1].replace('k', '000').replace('K', '0000'));
    b.minMembers = Math.max(0, b.minMembers + val);
    await b.save();
    return ctx.editMessageText(`👥 الحد الأدنى الحالي: ${b.minMembers}\nاستخدم الأزرار للزيادة أو النقصان:`, (ctx.callbackQuery as any).message.reply_markup);
  }

  if (data === 'stats') {
    const channelsCount = await Channel.countDocuments({ botId: b._id, isApproved: true });
    const totalMembers = (await Channel.find({ botId: b._id, isApproved: true })).reduce((acc, ch) => acc + ch.memberCount, 0);
    return ctx.reply(`📊 إحصائيات البوت:\n\n✅ القنوات المعتمدة: ${channelsCount}\n👥 إجمالي الأعضاء: ${totalMembers}`, Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]));
  }

  if (data === 'help_main') {
    try {
      const helpPath = path.join(process.cwd(), 'HELP.md');
      const helpText = fs.readFileSync(helpPath, 'utf-8');
      return ctx.reply(helpText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([Markup.button.callback('🔙 عودة', 'back_main')]) });
    } catch (e) { return ctx.reply('❓ المساعدة غير متوفرة.'); }
  }

  if (data === 'edit_head') {
    userStates.set(ctx.from!.id, { action: 'awaiting_head' });
    return ctx.reply('📝 أرسل رسالة الرأس الجديدة (نص أو ميديا).\n💡 يمكنك إعادة توجيه (Forward) أي منشور لاستنساخه:', Markup.inlineKeyboard([Markup.button.callback('❌ إلغاء', 'menu_list')]));
  }
};