'use client'

import { useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Shield, Globe, Users, Lock, Baby } from 'lucide-react'
import { updatePrivacy } from '@/app/actions/settings'
import type { User } from '@/lib/db'

export function PrivacySettings({ user }: { user: User }) {
  const [isPending, startTransition] = useTransition()

  function handleVisibilityChange(value: string) {
    startTransition(async () => {
      await updatePrivacy({ profileVisibility: value as any })
    })
  }

  function handleChildSafeModeChange(checked: boolean) {
    startTransition(async () => {
      await updatePrivacy({ childSafeMode: checked })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy & Safety
        </CardTitle>
        <CardDescription>
          Control who can see your profile and content preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-medium">Profile Visibility</p>
            <p className="text-sm text-muted-foreground">
              Choose who can view your profile and books
            </p>
          </div>
          <Select
            value={user.profile_visibility}
            onValueChange={handleVisibilityChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Public
                </div>
              </SelectItem>
              <SelectItem value="friends">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Friends Only
                </div>
              </SelectItem>
              <SelectItem value="private">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Private
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <Baby className="h-4 w-4" />
                Child-Safe Mode
              </div>
              <p className="text-sm text-muted-foreground">
                Hide books marked as 18+ from your feed and searches
              </p>
            </div>
            <Switch
              checked={user.child_safe_mode}
              onCheckedChange={handleChildSafeModeChange}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">Privacy levels explained:</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Public:</strong> Anyone can view your profile and public books</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Friends Only:</strong> Only accepted friends can view your profile</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span><strong>Private:</strong> Only you can see your profile and books</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
