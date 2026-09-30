import { invoke } from "@tauri-apps/api/core";

/** Microsoft Store 更新检查结果。 */
export interface StoreUpdateCheck {
  available: boolean;
  count: number;
  /** 商店将其标记为「强制更新」 */
  mandatory: boolean;
}

/** Microsoft Store 更新安装结果。 */
export interface StoreUpdateInstall {
  state: "upToDate" | "installed" | "canceled" | "failed";
  message: string;
}

export const appService = {
  /** 当前应用是否由 MSIX / Microsoft Store 分发（商店版本无自更新）。 */
  isStorePackaged: () => invoke<boolean>("is_store_packaged"),

  /**
   * 通过 Microsoft Store 官方接口（Windows.Services.Store.StoreContext）查询更新。
   * 仅对「从商店安装且已上架」的版本有效，其余情况会报错，调用方需回退到商店更新页。
   */
  checkStoreUpdates: () => invoke<StoreUpdateCheck>("check_store_updates"),

  /** 交给 Microsoft Store 下载并安装更新（内部阻塞，直到商店完成或取消）。 */
  installStoreUpdates: () =>
    invoke<StoreUpdateInstall>("install_store_updates"),
};
