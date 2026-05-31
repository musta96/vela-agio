import { Link, useNavigate } from "react-router-dom";
import { LogIn, LogOut, User as UserIcon, Shield, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export const AuthButton = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!user) {
    return (
      <Button asChild size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 border-0">
        <Link to="/auth">
          <LogIn className="h-4 w-4" />
          Sign In
        </Link>
      </Button>
    );
  }
  const label = user.email?.split("@")[0] || "Account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 max-w-[160px] bg-card text-foreground border border-border hover:bg-muted hover:text-foreground">
          <UserIcon className="h-4 w-4" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
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
        <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
