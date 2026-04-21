import { BellIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import {
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_OPTIONS,
  type NotificationPreferenceKey,
  readNotificationPreferences,
  writeNotificationPreferences,
} from "~/lib/notification-preferences";

export function NotificationSettingsCard() {
  const [preferences, setPreferences] = useState(() => readNotificationPreferences());

  const allEnabled = useMemo(
    () => NOTIFICATION_PREFERENCE_KEYS.every((key) => preferences[key]),
    [preferences],
  );

  const updatePreference = (key: NotificationPreferenceKey, enabled: boolean) => {
    const next = {
      ...preferences,
      [key]: enabled,
    };
    setPreferences(next);
    writeNotificationPreferences(next);
  };

  const setAllPreferences = (enabled: boolean) => {
    const next = {
      ...preferences,
    };

    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      next[key] = enabled;
    }

    setPreferences(next);
    writeNotificationPreferences(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BellIcon className="h-4 w-4" />
          Notifications
        </CardTitle>
        <CardDescription>
          Toggle toast notifications by type. Preferences are saved per browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={allEnabled}
            onClick={() => setAllPreferences(true)}
          >
            Enable all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!NOTIFICATION_PREFERENCE_KEYS.some((key) => preferences[key])}
            onClick={() => setAllPreferences(false)}
          >
            Disable all
          </Button>
        </div>

        <div className="divide-y border border-border bg-muted">
          {NOTIFICATION_PREFERENCE_KEYS.map((key) => (
            <div key={key} className="flex items-start justify-between gap-4 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {NOTIFICATION_PREFERENCE_OPTIONS[key].label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {NOTIFICATION_PREFERENCE_OPTIONS[key].description}
                </p>
              </div>
              <Switch
                checked={preferences[key]}
                onCheckedChange={(checked) => updatePreference(key, checked)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
