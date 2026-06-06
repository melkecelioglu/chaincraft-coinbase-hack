'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import api from '@/lib/api';
import type { TagCount } from '@/lib/types';

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagFilter({ selectedTags, onTagsChange }: TagFilterProps) {
  const [availableTags, setAvailableTags] = useState<TagCount[]>([]);

  useEffect(() => {
    api
      .get<TagCount[]>('/marketplace/tags')
      .then((res) => setAvailableTags(res.data))
      .catch(() => setAvailableTags([]));
  }, []);

  const handleToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleClearAll = () => {
    onTagsChange([]);
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            Filter by tag
            <ChevronDownIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Tags</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableTags.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags available
            </div>
          ) : (
            availableTags.map(({ tag, count }) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={selectedTags.includes(tag)}
                onCheckedChange={() => handleToggle(tag)}
                onSelect={(e) => e.preventDefault()}
              >
                {tag}
                <span className="ml-auto text-xs text-muted-foreground">
                  {count}
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
          {selectedTags.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={handleClearAll}
                onSelect={(e) => e.preventDefault()}
                className="text-muted-foreground"
              >
                Clear all
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedTags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="cursor-pointer gap-1"
          onClick={() => handleRemoveTag(tag)}
        >
          {tag}
          <XIcon className="size-3" />
        </Badge>
      ))}
    </div>
  );
}
