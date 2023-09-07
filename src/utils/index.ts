import iconList from "../constants/iconList";
import { Icon } from "../models";
import path from "path";

export function findMatchIconOrNull(text: string): Icon | null {
  if (!text.startsWith("~")) return null;
  if (text.includes(" ")) return null;

  // remove starting `~`
  const keyword = text.slice(1);

  const matchIcon = iconList.filter((icon) =>
    icon.keywords
      .map((kw) => kw.toLocaleLowerCase())
      .includes(keyword.toLocaleLowerCase())
  );

  if (matchIcon.length === 0) return null;
  return matchIcon[0];
}

export function getAbsoluteIconFilePath(icon: Icon) {
  const ICON_DIRECTORY_ROOT = path.resolve("./src/constants/icon");
  return path.join(ICON_DIRECTORY_ROOT, icon.filePath);
}
