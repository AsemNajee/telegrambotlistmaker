import { Markup } from 'telegraf';
import { IBot } from '../../models/Bot';

export const getMainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📜 إعدادات القائمة', 'menu_list'), Markup.button.callback('📥 إعدادات الاستقبال', 'menu_reception')],
  [Markup.button.callback('👀 مراقبة القنوات', 'menu_watch'), Markup.button.callback('📊 الإحصائيات', 'stats')],
  [Markup.button.callback('🚀 رفع القائمة', 'bump_list'), Markup.button.callback('📢 نشر جديد', 'publish')],
  [Markup.button.callback('🗑 حذف القائمة', 'delete'), Markup.button.callback('❓ المساعدة', 'help_main')]
]);

export const getListSettingsMenu = (b: IBot) => Markup.inlineKeyboard([
  [Markup.button.callback(`🔗 المعاينة: ${b.isPreviewEnabled ? '✅' : '❌'}`, 'toggle_preview')],
  [Markup.button.callback(`📝 النوع: ${b.listType === 'buttons' ? 'أزرار' : 'نص'}`, 'toggle_list_type')],
  [Markup.button.callback(`🔢 الأعمدة: ${b.columnsCount}`, 'menu_cols')],
  [Markup.button.callback('⚖️ إعدادات الترتيب', 'menu_order')],
  [Markup.button.callback('🎨 تنسيق الاسم والزخرفة', 'menu_style')],
  [Markup.button.callback('📝 رسالة الرأس', 'edit_head')],
  [Markup.button.callback('🔄 تحديث القنوات', 'menu_update_channels')],
  [Markup.button.callback('👁 معاينة فورية', 'live_preview')],
  [Markup.button.callback('🔙 عودة', 'back_main')]
]);

export const getReceptionMenu = (b: IBot) => Markup.inlineKeyboard([
  [Markup.button.callback(`📥 الاستقبال: ${b.isReceptionEnabled ? '✅' : '❌'}`, 'toggle_reception')],
  [Markup.button.callback(`🔒 القنوات الخاصة: ${b.isPrivateReceptionEnabled ? '✅' : '❌'}`, 'toggle_private')],
  [Markup.button.callback(`👥 الحد الأدنى: ${b.minMembers}`, 'menu_min_members')],
  [Markup.button.callback(`📏 أقصى طول للاسم: ${(b as any).maxNameLength || 30}`, 'menu_max_name')],
  [Markup.button.callback(`🔔 إشعار المسؤول (بوت): ${(b as any).notifyAdminBot ? '✅' : '❌'}`, 'toggle_notify_bot')],
  [Markup.button.callback(`🔔 إشعار المسؤول (قناة): ${(b as any).notifyAdminChannel ? '✅' : '❌'}`, 'toggle_notify_channel')],
  [Markup.button.callback('🔙 عودة', 'back_main')]
]);

export const getWatchMenu = (b: IBot) => Markup.inlineKeyboard([
  [Markup.button.callback(`🔄 إعادة نشر عند الحذف: ${(b as any).autoRepublishOnDelete ? '✅' : '❌'}`, 'toggle_republish_delete')],
  [Markup.button.callback(`🚀 الرفع التلقائي: ${b.isAutoBumpEnabled ? '✅' : '❌'}`, 'toggle_auto_bump')],
  [Markup.button.callback(`⚙️ حد الرفع: ${b.bumpThreshold || 5}`, 'menu_bump_threshold')],
  [Markup.button.callback(`🛡 الحماية: ${b.isProtectionEnabled ? '✅' : '❌'}`, 'toggle_protection')],
  [Markup.button.callback('🔙 عودة', 'back_main')]
]);