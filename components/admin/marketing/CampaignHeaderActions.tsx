"use client";

import { FileUp, Plus, RefreshCw, Table2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CampaignHeaderActionsProps {
  canWrite: boolean;
  syncing?: boolean;
  onSyncSubscribers: () => void;
  onSubscribers: () => void;
  onImportLeads: () => void;
  onOpenLeads: () => void;
  onNewCampaign: () => void;
}

/**
 * Header actions for the Email campaigns page. Read-only campaign admins keep
 * access to the subscriber list and the lead database, but cannot import or
 * mutate campaign data.
 */
export function CampaignHeaderActions({
  canWrite,
  syncing = false,
  onSyncSubscribers,
  onSubscribers,
  onImportLeads,
  onOpenLeads,
  onNewCampaign,
}: CampaignHeaderActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {canWrite ? (
        <Button variant="outline" onClick={onImportLeads}>
          <FileUp className="mr-2 h-4 w-4" aria-hidden />
          Import Leads
        </Button>
      ) : null}
      <Button variant="outline" onClick={onOpenLeads}>
        <Table2 className="mr-2 h-4 w-4" aria-hidden />
        Open leads database
      </Button>
      {canWrite ? (
        <Button variant="outline" onClick={onSyncSubscribers} disabled={syncing}>
          {syncing ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Users className="mr-2 h-4 w-4" aria-hidden />
          )}
          Sync subscribers
        </Button>
      ) : null}
      <Button variant="outline" onClick={onSubscribers}>
        <Users className="mr-2 h-4 w-4" aria-hidden />
        Subscribers
      </Button>
      {canWrite ? (
        <Button onClick={onNewCampaign}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New campaign
        </Button>
      ) : null}
    </div>
  );
}
