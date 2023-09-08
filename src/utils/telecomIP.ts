import { range } from "discord.js";

const TELECOM_IP = [
  // KT
  "39.7",
  "110.70",
  "118.235",
  "175.223",
  "211.246",

  // LG
  "106.102",
  "125.188",
  "117.111",
  "211.36",
  "106.101",

  // SK
  ...Array.from(range({ start: 160, end: 184 })).map((b) => `27.${b}`),
  "203.226",
  ...Array.from(range({ start: 32, end: 64 })).map((b) => `223.${b}`),
] as const;

export function getRandomTelecomIP() {
  return TELECOM_IP[Math.floor(Math.random() * TELECOM_IP.length)];
}
