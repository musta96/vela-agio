import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPendingFriendInvite, clearFriendInvite } from "@/lib/friendInvites";

/** Covers OAuth-created accounts as well as delayed email confirmation. */
export function FriendInviteAttribution() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const pending = getPendingFriendInvite();
    if (!pending) return;
    void supabase.rpc("claim_friend_invite", { _visit_id: pending.receipt }).then(({ error }) => {
      if (!error) clearFriendInvite();
    });
  }, [user?.id]);
  return null;
}