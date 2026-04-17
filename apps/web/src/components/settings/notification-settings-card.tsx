import { IconBell } from "@tabler/icons-solidjs";
import { createMemo, createSignal, For } from "solid-js";
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
  const [preferences, setPreferences] = createSignal(readNotificationPreferences());

  const allEnabled = createMemo(() =>
    NOTIFICATION_PREFERENCE_KEYS.every((key) => preferences()[key]),
  );

  const updatePreference = (key: NotificationPreferenceKey, enabled: boolean) => {
    const next = {
      ...preferences(),
      [key]: enabled,
    };
    setPreferences(next);
    writeNotificationPreferences(next);
  };

  const setAllPreferences = (enabled: boolean) => {
    const next = {
      ...preferences(),
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
        <CardTitle class="text-base flex items-center gap-2">
          <IconBell class="h-4 w-4" />
          Notifications
        </CardTitle>
        <CardDescription>
          Toggle toast notifications by type. Preferences are saved per browser.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={allEnabled()}
            onClick={() => setAllPreferences(true)}
          >
            Enable all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!NOTIFICATION_PREFERENCE_KEYS.some((key) => preferences()[key])}
            onClick={() => setAllPreferences(false)}
          >
            Disable all
          </Button>
        </div>

        <div class="divide-y border border-border/60 bg-muted/10">
          <For each={NOTIFICATION_PREFERENCE_KEYS}>
            {(key) => (
              <div class="flex items-start justify-between gap-4 p-3">
                <div class="space-y-1">
                  <p class="text-sm font-medium text-foreground">
                    {NOTIFICATION_PREFERENCE_OPTIONS[key].label}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {NOTIFICATION_PREFERENCE_OPTIONS[key].description}
                  </p>
                </div>
                <Switch
                  checked={preferences()[key]}
                  onChange={(checked) => updatePreference(key, checked)}
                />
              </div>
            )}
          </For>
        </div>
      </CardContent>
    </Card>
  );
}
