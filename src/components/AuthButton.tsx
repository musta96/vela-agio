import { Link, useNavigate } from "react-router-dom";
import { LogIn, LogOut, User as UserIcon, Shield, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedAvatarUrl } from "@/lib/avatar";

export const AuthButton = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const signedAvatar = useSignedAvatarUrl(avatarUrl);
  useEffect(() => {
    if (!user) { setAvatarUrl(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setAvatarUrl((data as any)?.avatar_url || null);
    })();
    return () => { cancelled = true; };
  }, [user]);
  if (loading) return null;
  if (!user) {
    return (
      <Button asChild size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 border-0">
        <Link to="/auth">
          <LogIn className="h-4 w-4" />
          <span className="hidden sm:inline">Sign In</span>
        </Link>
      </Button>
    );
  }
  const label = user.email?.split("@")[0] || "Account";
  const initials = (label.match(/[A-Za-z0-9]/g) || ["U"]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Account: ${label}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors overflow-hidden"
            >
              <Avatar className="h-9 w-9">
                {signedAvatar && <AvatarImage src={signedAvatar} alt={label} />}
                <AvatarFallback className="bg-card text-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <span className="text-xs">{user.email || label}</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          <div className="flex flex-col">
            <span className="text-sm font-medium truncate">{label}</span>
            <span className="text-xs text-muted-foreground truncate font-normal">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
          <UserIcon className="h-4 w-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/security")} className="gap-2">
          <Shield className="h-4 w-4" /> Security
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
          <SettingsIcon className="h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await signOut(); navigate("/"); }} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
