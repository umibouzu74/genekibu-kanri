import { useEffect, useMemo, useState } from "react";
import { db, authReady, isConfigured } from "../firebase/config";
import { ref, onValue } from "firebase/database";
import { useAuthGeneration } from "./useSyncedStorage";
import {
  clearCloudReadError,
  reportCloudRead,
  reportCloudReadError,
} from "../firebase/cloudState";
import {
  FIREBASE_PROJECT_PATH_LEGACY,
  LEGACY_PROJECT_STORAGE_KEYS,
} from "../timetable-builder/utils/constants";
import {
  BUILDER_PROJECT_SAVED_EVENT,
  KOSHU_SEASONS,
  seasonStorage,
} from "../timetable-builder/utils/seasons";
import { parseBuilderProject } from "../utils/builderLessons";
import { resolveSeasonProjects } from "../utils/builderSeasons";

const LEGACY = "legacy";

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return { exists: raw != null, project: raw != null ? parseBuilderProject(raw) : null };
  } catch {
    return { exists: false, project: null };
  }
}

function readLegacyLocal() {
  for (const key of LEGACY_PROJECT_STORAGE_KEYS) {
    const slot = readLocal(key);
    if (slot.exists) return slot;
  }
  return { exists: false, project: null };
}

// 講習時間割作成 (timetable-builder) の季節ごとの project を読み取り専用で購読する。
// builder 自身の同期 (useHistoryStack) とは独立した購読で、こちらからは一切
// 書き込まない — 正は常に builder 側。
//
// - 季節 (春期 / 夏期 / 冬期) ごとのノード appData/builder/schedule_project_<季節> と、
//   季節に分ける前の単一 project のノード (旧 appData/builder/schedule_project) を
//   購読する。どの季節にどの project を使うかは utils/builderSeasons.resolveSeasonProjects
// - マウント時: この端末の LocalStorage (季節のキー + 旧キー) を即時反映 (オフラインでも
//   表示できる)。builder が同じタブで保存したときも読み直す (BUILDER_PROJECT_SAVED_EVENT)
// - 解釈できないペイロード (壊れた JSON / 構造不正 / このクライアントより新しい
//   スキーマ) は project = null にする (表示はこの端末の値 → それも無ければ出さない)
//
// 戻り値: 季節 → { status, source, project } (resolveSeasonProjects の戻り値)
export function useBuilderProjects() {
  const [local, setLocal] = useState(() => {
    const out = {};
    for (const { key } of KOSHU_SEASONS) out[key] = readLocal(seasonStorage(key).storageKey);
    out[LEGACY] = readLegacyLocal();
    return out;
  });
  // 季節 (と LEGACY) → { received, raw, project, error }
  const [cloud, setCloud] = useState({});
  // useSyncedStorage と同じく、ログインの世代が変わったら張り直す
  const authGeneration = useAuthGeneration();

  // builder が同じタブで季節の project を保存したら、その季節だけ読み直す
  useEffect(() => {
    const onSaved = (e) => {
      const storageKey = e?.detail?.storageKey;
      const season = KOSHU_SEASONS.find((s) => seasonStorage(s.key).storageKey === storageKey);
      if (!season) return;
      setLocal((prev) => ({ ...prev, [season.key]: readLocal(storageKey) }));
    };
    window.addEventListener(BUILDER_PROJECT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(BUILDER_PROJECT_SAVED_EVENT, onSaved);
  }, []);

  useEffect(() => {
    if (!isConfigured || !db) return undefined;

    let unsubscribed = false;
    const detaches = [];
    const targets = [
      ...KOSHU_SEASONS.map((s) => [s.key, seasonStorage(s.key).firebasePath]),
      [LEGACY, FIREBASE_PROJECT_PATH_LEGACY],
    ];
    for (const [, path] of targets) clearCloudReadError(path);

    authReady.then(() => {
      if (unsubscribed) return;
      for (const [slot, path] of targets) {
        detaches.push(
          onValue(
            ref(db, path),
            (snapshot) => {
              reportCloudRead(path);
              const raw = snapshot.val();
              const value = typeof raw === "string" && raw !== "" ? raw : null;
              setCloud((prev) => ({
                ...prev,
                [slot]: { received: true, raw: value, project: parseBuilderProject(value), error: false },
              }));
            },
            (err) => {
              console.warn("[useBuilderProjects] onValue error:", path, err);
              reportCloudReadError(path, err);
              setCloud((prev) => ({ ...prev, [slot]: { ...prev[slot], error: true } }));
            }
          )
        );
      }
    });

    return () => {
      unsubscribed = true;
      // 自分の購読だけ外す。同じパスは講習時間割作成 (useHistoryStack) も読んで
      // いて、off(dbRef) だとログインの世代で張り直すたびにそちらまで止まる
      detaches.forEach((detach) => detach());
    };
  }, [authGeneration]);

  return useMemo(() => {
    const seasonsCloud = {};
    const seasonsLocal = {};
    for (const { key } of KOSHU_SEASONS) {
      seasonsCloud[key] = cloud[key];
      seasonsLocal[key] = local[key];
    }
    return resolveSeasonProjects({
      configured: Boolean(isConfigured && db),
      cloud: seasonsCloud,
      local: seasonsLocal,
      legacyCloud: cloud[LEGACY],
      legacyLocal: local[LEGACY],
    });
  }, [cloud, local]);
}
