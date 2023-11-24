export const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS DISCORD.GUILD_PREF (
       GUILD_ID varchar(30) NOT NULL COMMENT '디스코드채널아이디',
       GUILD_NM varchar(127) COMMENT '디스코드채널명',
       ALLOW_LIST json  COMMENT '디시콘사용목록',
       UPDATED_BY_ID varchar(32)  COMMENT '수정자아이디',
       UPDATED_BY_NM varchar(32)  COMMENT '수정자이름',
       UPDATED_DTTM datetime  COMMENT '수정일', PRIMARY KEY (
    GUILD_ID
  )
);
`;

export const INSERT_ONE_PREF = `
INSERT INTO DISCORD.GUILD_REF
VALUES (?, ?, ?, ?, ?, NOW())
;
`;

export const UPDATE_ONE_PREF = `
UPDATE DISCORD.GUILD_REF
   SET ALLOW_LIST = ?
     , UPDATED_BY_ID = ?
     , UPDATED_BY_NM = ?
     , UPDATED_DTTM = NOW()
 WHERE GUILD_ID = ?
;
`;

export const SELECT_ONE_PREF = `
SELECT *
  FROM DISCORD.GUILD_REF
 WHERE GUILD_ID = ?
;
`;
