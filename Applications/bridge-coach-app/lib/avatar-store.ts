// Profile pictures: picking one, and knowing everyone else's.
//
// A picture is a base64 data URL on the profile row (backend migration 0040).
// The app downsizes hard before upload — 256x256 JPEG, quality 0.7, which lands
// around 40 kB — because these are drawn at 29pt in a list and 92pt in the
// profile sheet, and the row constraint caps the column at ~150 kB anyway.
//
// Reads are cached per token in module state. A roster and a chat thread ask for
// overlapping sets of people, and a face that has already been fetched should
// not be fetched again while you swipe between tabs; a sign-out drops the lot.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import {
  fetchAvatars,
  fetchClubHeaderImage,
  fetchMyAvatar,
  setClubHeaderImage,
  setMyAvatar,
} from "./nexus";

/** What the camera's output is squeezed to before it leaves the phone. */
const UPLOAD = { size: 256, quality: 0.7 };
/** A chat picture keeps its own shape; only its long edge is bounded. */
const CHAT_IMAGE = { longEdge: 1280, quality: 0.7 };
/** A club banner is full-bleed, so it gets more pixels — and a 16:9 crop. */
const BANNER = { width: 1080, quality: 0.7, aspect: [16, 9] as [number, number] };

/** `mine: undefined` means "not fetched yet"; null means "has no picture". */
type Cache = { token: string; byProfile: Map<string, string | null>; mine: string | null | undefined };
let cache: Cache | null = null;

function cacheFor(token: string): Cache {
  if (cache?.token !== token) cache = { token, byProfile: new Map(), mine: undefined };
  return cache;
}

/** Club banners by program id, and who is drawing them. */
const headers = new Map<string, string | null>();
const headerListeners = new Set<(programId: string, uri: string | null) => void>();

export function subscribeToClubHeader(
  fn: (programId: string, uri: string | null) => void,
): () => void {
  headerListeners.add(fn);
  return () => headerListeners.delete(fn);
}

function publishHeader(programId: string, uri: string | null) {
  for (const fn of headerListeners) fn(programId, uri);
}

/** Listeners that redraw when the signed-in person's own picture changes. */
const listeners = new Set<(uri: string | null) => void>();

export function subscribeToMyAvatar(fn: (uri: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function publishMine(uri: string | null) {
  for (const fn of listeners) fn(uri);
}

export function clearAvatarCache(): void {
  cache = null;
  headers.clear();
  publishMine(null);
}

export async function loadMyAvatar(token: string): Promise<string | null> {
  const c = cacheFor(token);
  if (c.mine !== undefined) return c.mine;
  const uri = await fetchMyAvatar(token).catch(() => null);
  c.mine = uri;
  publishMine(uri);
  return uri;
}

/**
 * Pictures for a set of people, merging what is already known with one request
 * for the rest. Ids without a picture are remembered as "none" so they are not
 * asked for again.
 */
export async function loadAvatars(
  token: string,
  profileIds: (string | null | undefined)[],
): Promise<Map<string, string | null>> {
  const c = cacheFor(token);
  const wanted = [...new Set(profileIds.filter((id): id is string => !!id))];
  const missing = wanted.filter((id) => !c.byProfile.has(id));

  if (missing.length > 0) {
    const found = await fetchAvatars(token, missing).catch(() => ({}) as Record<string, string>);
    // Record the absences too — otherwise a club of people without pictures
    // would re-ask on every render.
    for (const id of missing) c.byProfile.set(id, found[id] ?? null);
  }
  return c.byProfile;
}

/**
 * Ask for a photo, downsize it, upload it, and return the data URL.
 *
 * Returns null when the person cancels or declines the permission — both are
 * ordinary outcomes, not errors. An upload failure throws, so the caller can say
 * so rather than silently showing the old picture.
 */
export async function pickAndUploadAvatar(token: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    // Square, because every surface draws the picture in a circle.
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
    .resize({ width: UPLOAD.size, height: UPLOAD.size })
    .renderAsync();
  const out = await rendered.saveAsync({
    compress: UPLOAD.quality,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not read the picture");

  const dataUrl = `data:image/jpeg;base64,${out.base64}`;
  await setMyAvatar(token, dataUrl);

  const c = cacheFor(token);
  c.mine = dataUrl;
  publishMine(dataUrl);
  return dataUrl;
}

/**
 * Pick a club banner, downsize it, and hang it on the club.
 *
 * Same flow as a profile picture at a different size and shape: wider, since it
 * spans the screen, and cropped 16:9 because the banner is a band behind the
 * club's name rather than a square.
 */
export async function pickAndUploadClubHeader(
  token: string,
  programId: string,
): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: BANNER.aspect,
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const rendered = await ImageManipulator.manipulate(picked.assets[0].uri)
    // Height follows the width, so the crop's own ratio is preserved.
    .resize({ width: BANNER.width })
    .renderAsync();
  const out = await rendered.saveAsync({
    compress: BANNER.quality,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not read the image");

  const dataUrl = `data:image/jpeg;base64,${out.base64}`;
  await setClubHeaderImage(token, programId, dataUrl);
  headers.set(programId, dataUrl);
  publishHeader(programId, dataUrl);
  return dataUrl;
}

/** The club's banner, cached so switching tabs doesn't refetch it. */
export async function loadClubHeader(
  token: string,
  programId: string,
): Promise<string | null> {
  if (headers.has(programId)) return headers.get(programId) ?? null;
  const uri = await fetchClubHeaderImage(token, programId).catch(() => null);
  headers.set(programId, uri);
  return uri;
}

export async function removeClubHeader(token: string, programId: string): Promise<void> {
  await setClubHeaderImage(token, programId, null);
  headers.set(programId, null);
  publishHeader(programId, null);
}

/**
 * Pick a picture to send in a chat. Returns null when cancelled or declined.
 *
 * No forced crop and no square: a photo of a hand or a screenshot of a board
 * should keep its shape. 1280 on the long edge is enough to read a scorecard
 * while staying inside the column's cap.
 */
export async function pickChatImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const asset = picked.assets[0];
  // Resize by the LONG edge, so a portrait photo is not stretched to landscape.
  const portrait = (asset.height ?? 0) > (asset.width ?? 0);
  const rendered = await ImageManipulator.manipulate(asset.uri)
    .resize(portrait ? { height: CHAT_IMAGE.longEdge } : { width: CHAT_IMAGE.longEdge })
    .renderAsync();
  const out = await rendered.saveAsync({
    compress: CHAT_IMAGE.quality,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error("Could not read the image");
  return `data:image/jpeg;base64,${out.base64}`;
}

/** Remove the caller's picture. */
export async function removeMyAvatar(token: string): Promise<void> {
  await setMyAvatar(token, null);
  const c = cacheFor(token);
  c.mine = null;
  publishMine(null);
}
