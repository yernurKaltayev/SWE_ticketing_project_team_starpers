import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/session";
export function usePaymentQuery<T>(
  path: string,
  parse: (v: unknown) => T,
  enabled = true,
) {
  const { user, controller } = useSession();
  return useQuery({
    queryKey: ["f4", user?.id, path],
    queryFn: async ({ signal }) =>
      parse(await controller.request(path, { signal })),
    enabled: !!user && enabled && !!path,
    retry: false,
  });
}
export function usePaymentAction() {
  const { controller } = useSession();
  const client = useQueryClient();
  return useMutation({
    // Account form resets its observer after completion; discard sensitive variables immediately.
    gcTime: 0,
    mutationFn: async ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => controller.request(path, { method, body }),
    retry: false,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["f4"] }),
        client.invalidateQueries({ queryKey: ["f3"] }),
      ]);
    },
  });
}
