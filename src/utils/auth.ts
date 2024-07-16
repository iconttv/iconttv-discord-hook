import GuildPermissionModel from '../database/model/GuildPermissionModel.js';

export async function rejectGPTRequestAndGetMessage(guildId: string) {
  const guildPermission = await GuildPermissionModel.find({
    guildId,
  });
  if (
    guildPermission === null ||
    guildPermission === undefined ||
    guildPermission.length === 0
  ) {
    return '서버에서 해당 기능을 사용할 권한이 부족합니다. [000]';
  }
  if (guildPermission[0].level < 3) {
    return '서버에서 해당 기능을 사용할 권한이 부족합니다. [001]';
  }
}
