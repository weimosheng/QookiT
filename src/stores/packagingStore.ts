import { create } from "zustand";
import { appService } from "../services/appService";

interface PackagingState {
  /** 由 Microsoft Store / MSIX 分发：更新交给商店，界面不提供自更新入口。 */
  storeManaged: boolean;
  /** 应用启动时调用一次，探测当前安装形态。 */
  init: () => Promise<void>;
}

export const usePackagingStore = create<PackagingState>((set) => ({
  storeManaged: false,
  init: async () => {
    try {
      set({ storeManaged: await appService.isStorePackaged() });
    } catch {
      // 非 Tauri 环境（例如仅跑 `pnpm dev` 调试界面）没有该命令，保持默认值。
    }
  },
}));
