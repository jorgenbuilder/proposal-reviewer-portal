"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PROPOSAL_TOPICS, TOPIC_NAMES } from "@/lib/nns";

interface NotificationPreferencesProps {
  endpoint: string;
}

export function NotificationPreferences({ endpoint }: NotificationPreferencesProps) {
  const [selectedTopics, setSelectedTopics] = useState<number[]>([PROPOSAL_TOPICS.PROTOCOL_CANISTER_MANAGEMENT]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load current preferences
  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch(`/api/subscription-preferences?endpoint=${encodeURIComponent(endpoint)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.topics && Array.isArray(data.topics)) {
            setSelectedTopics(data.topics);
          }
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      }
    }
    loadPreferences();
  }, [endpoint]);

  const handleToggleTopic = (topic: number) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/subscription-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          topics: selectedTopics,
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Preferences saved successfully!" });
      } else {
        setMessage({ type: "error", text: "Failed to save preferences." });
      }
    } catch (error) {
      console.error("Save error:", error);
      setMessage({ type: "error", text: "An error occurred while saving." });
    } finally {
      setSaving(false);
    }
  };

  const topicEntries = Object.entries(PROPOSAL_TOPICS).map(([key, value]) => ({
    id: value,
    name: TOPIC_NAMES[value] || key,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Select which proposal topics you want to receive notifications for
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {topicEntries.map((topic) => (
            <div key={topic.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`topic-${topic.id}`}
                checked={selectedTopics.includes(topic.id)}
                onChange={() => handleToggleTopic(topic.id)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor={`topic-${topic.id}`} className="text-sm cursor-pointer">
                {topic.name}
              </Label>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || selectedTopics.length === 0}>
            {saving ? "Saving..." : "Save Preferences"}
          </Button>
          {selectedTopics.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Select at least one topic
            </span>
          )}
        </div>

        {message && (
          <p
            className={`text-sm ${
              message.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-destructive"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
