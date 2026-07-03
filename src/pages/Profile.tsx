import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, ShieldCheck, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useSignedAvatarUrl } from "@/lib/avatar";

interface ProfileRow {
  display_name: string | null; avatar_url: string | null; phone: string | null;
  bio: string | null; date_of_birth: string | null; country_residence: string | null;
  country_tax_residence: string | null;
}

export default function Profile() {
  const { user } = useAuth();
  const [p, setP] = useState<ProfileRow>({ display_name: "", avatar_url: "", phone: "", bio: "", date_of_birth: "", country_residence: "", country_tax_residence: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = useSignedAvatarUrl(p.avatar_url);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles").select("display_name, avatar_url, phone, bio, date_of_birth, country_residence, country_tax_residence").eq("user_id", user.id).maybeSingle();
      if (data) setP({ ...p, ...data });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, ...p }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Could not save profile", { description: error.message });
    else toast.success("Profile updated");
  };

  const onUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Image must be under 4 MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setUploading(false); toast.error("Upload failed", { description: upErr.message }); return; }
    // Bucket is private — store the path; UI resolves to a signed URL at render time.
    setP((prev) => ({ ...prev, avatar_url: path }));
    await supabase.from("profiles").upsert({ user_id: user.id, avatar_url: path }, { onConflict: "user_id" });
    setUploading(false);
    toast.success("Avatar updated");
  };

  const initials = (p.display_name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Profile · Vela" description="Manage your personal information, avatar and contact details." path="/profile" />
      <main className="container mx-auto px-4 py-6 space-y-5 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="text-sm text-muted-foreground">Your personal information across Vela.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avatar</CardTitle>
            <CardDescription>JPG or PNG, up to 4 MB.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt="avatar" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Upload
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Personal information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">Change email in <Link to="/security" className="underline">Security</Link>.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn">Display name</Label>
              <Input id="dn" value={p.display_name ?? ""} onChange={(e) => setP({ ...p, display_name: e.target.value })} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ph">Phone</Label>
              <Input id="ph" value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} placeholder="+39 ..." maxLength={32} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" type="date" value={p.date_of_birth ?? ""} onChange={(e) => setP({ ...p, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr">Country of residence</Label>
              <Input id="cr" value={p.country_residence ?? ""} onChange={(e) => setP({ ...p, country_residence: e.target.value })} placeholder="IT" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr">Tax residence</Label>
              <Input id="tr" value={p.country_tax_residence ?? ""} onChange={(e) => setP({ ...p, country_tax_residence: e.target.value })} placeholder="IT" maxLength={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={p.bio ?? ""} onChange={(e) => setP({ ...p, bio: e.target.value })} maxLength={500} rows={3} placeholder="A few words about your investing style…" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="outline" asChild><Link to="/security"><ShieldCheck className="mr-2 h-4 w-4" /> Security settings</Link></Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save changes</Button>
        </div>
      </main>
    </div>
  );
}