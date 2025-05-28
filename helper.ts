// This describes the events that will have payload replaced by a proxy,
// which will allow calling methods on them
// This unfortunately have to be hardcoded, because Discord does not provide
// any source for this, and there's no way to map event names to paths
const c: string = "channels/:channel_id";
const g: string = "guilds/:guild_id";
const m: string = `${c}/messages/:message_id`;
const ms: string = `${c}/messages`;
const r: string = `${c}/messages/:message_id/reactions`;
const re: string = `${r}/:emoji`;
const t: string = `${c}/threads`;
const tt: string = `${c}/threads/:thread_id`;
const gc: string = `${g}/channels`;
const gcu: string = `${g}/channels/:channel_id`;
const gb: string = `${g}/bans/:user_id`;
const gm: string = `${g}/members/:user_id`;
const gr: string = `${g}/roles`;
const gru: string = `${g}/roles/:role_id`;
const ge: string = `${g}/emojis`;
const geu: string = `${g}/emojis/:emoji_id`;
const gs: string = `${g}/stickers`;
const gsu: string = `${g}/stickers/:sticker_id`;
const final: Record<string, string> = {
  messageCreate: m,
  messageUpdate: m,
  messageDelete: m,
  messageDeleteBulk: ms,
  reactionAdd: re,
  reactionRemove: re,
  reactionRemoveAll: r,
  reactionRemoveEmoji: re,
  threadCreate: t,
  threadUpdate: tt,
  threadDelete: tt,
  channelCreate: gc,
  channelUpdate: gcu,
  channelDelete: gcu,
  guildBanAdd: gb,
  guildBanRemove: gb,
  guildMemberAdd: gm,
  guildMemberUpdate: gm,
  guildMemberRemove: gm,
  guildRoleCreate: gr,
  guildRoleUpdate: gru,
  guildRoleDelete: gru,
  guildEmojiCreate: ge,
  guildEmojiUpdate: geu,
  guildEmojiDelete: geu,
  guildStickerCreate: gs,
  guildStickerUpdate: gsu,
  guildStickerDelete: gsu,
};
export default final;
