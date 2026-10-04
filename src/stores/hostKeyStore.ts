import { create } from "zustand";
import { connectionService } from "../services/connectionService";
import type { HostKeyVerifyPayload } from "../types/events";

/**
 * 首次连接主机密钥确认队列。
 *
 * 后端在 TOFU 首次连接时通过事件请求确认；同一时间可能有多个连接在等待，
 * 因此用队列逐个展示，用户回应后调用 `respond_host_key` 回执。
 */
interface HostKeyState {
  queue: HostKeyVerifyPayload[];
  /** 收到后端确认请求。 */
  push: (req: HostKeyVerifyPayload) => void;
  /** 请求已在后端结束（信任/拒绝/超时/取消），仅关闭对话框、不再回执。 */
  dismiss: (requestId: string) => void;
  /** 用户做出选择：先出队再回执，避免重复提交。 */
  respond: (requestId: string, accepted: boolean) => void;
}

export const useHostKeyStore = create<HostKeyState>((set, get) => ({
  queue: [],
  push: (req) =>
    set((s) =>
      s.queue.some((q) => q.request_id === req.request_id)
        ? s
        : { queue: [...s.queue, req] },
    ),
  dismiss: (requestId) =>
    set((s) => ({ queue: s.queue.filter((q) => q.request_id !== requestId) })),
  respond: (requestId, accepted) => {
    if (!get().queue.some((q) => q.request_id === requestId)) return;
    set((s) => ({
      queue: s.queue.filter((q) => q.request_id !== requestId),
    }));
    void connectionService.respondHostKey(requestId, accepted).catch(() => {});
  },
}));
