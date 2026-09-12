"use client";

import { MainLayout } from "@/components/layouts/MainLayout";
import { ManagedWorkspace } from "@/components/managed/managed-workspace";
import { OwnerRecovery } from "@/components/managed/owner-recovery";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";

export function StrategyView() {
  const wallet = useManagedSession(42161);

  return (
    <MainLayout activePage="strategies">
      <OwnerRecovery
        key={wallet.session?.owner ?? "anonymous"}
        session={wallet.session}
      />
      <ManagedWorkspace wallet={wallet} />
    </MainLayout>
  );
}
