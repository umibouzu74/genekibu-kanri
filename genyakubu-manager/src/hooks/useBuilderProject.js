import { useEffect, useState } from "react";
import { db, authReady, isConfigured } from "../firebase/config";
import { ref, onValue, off } from "firebase/database";
import {
  FIREBASE_PROJECT_PATH,
  STORAGE_KEY_PROJECT,
} from "../timetable-builder/utils/constants";
import { parseBuilderProject } from "../utils/builderLessons";

// 講習時間割作成 (timetable-builder) の project を読み取り専用で購読する。
// builder 自身の同期 (useHistoryStack) とは独立した購読で、こちらからは
// 一切書き込まない — 正は常に builder 側。
//
// - マウント時: builder が同一端末で保存した LocalStorage キャッシュ
//   (builder.schedule_project) を即時反映 (オフラインでも表示できる)
// - 以後: RTDB appData/builder/schedule_project (JSON 文字列) を onValue 購読
// - 解釈できないペイロード (壊れた JSON / 構造不正 / このクライアントより
//   新しいスキーマ) は無視して直前の値を保持する。表示専用なので、壊れた
//   受信で講習コマが画面から消えるより古い表示が残る方が安全
export function useBuilderProject() {
  const [project, setProject] = useState(null);

  useEffect(() => {
    try {
      const p = parseBuilderProject(localStorage.getItem(STORAGE_KEY_PROJECT));
      if (p) setProject(p);
    } catch {
      /* 読めなければ Firebase 待ち */
    }
  }, []);

  useEffect(() => {
    if (!isConfigured || !db) return undefined;

    let unsubscribed = false;
    const dbRef = ref(db, FIREBASE_PROJECT_PATH);

    authReady.then(() => {
      if (unsubscribed) return;
      onValue(
        dbRef,
        (snapshot) => {
          const p = parseBuilderProject(snapshot.val());
          if (p) setProject(p);
        },
        (err) => {
          console.warn("[useBuilderProject] onValue error:", err);
        }
      );
    });

    return () => {
      unsubscribed = true;
      off(dbRef);
    };
  }, []);

  return project;
}
