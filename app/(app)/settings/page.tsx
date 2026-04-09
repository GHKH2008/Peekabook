import { getSession } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings } from 'lucide-react'
import { ProfileSettings } from '@/components/profile-settings'
import { PrivacySettings } from '@/components/privacy-settings'

export default async function SettingsPage() {
  const user = await getSession()
  if (!user) return null

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile and privacy preferences
        </p>
      </div>

      <ProfileSettings user={user} />
      <PrivacySettings user={user} />
    </div>
  )
}
