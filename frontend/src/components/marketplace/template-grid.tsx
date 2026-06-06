'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateCard } from './template-card';
import { SearchBar } from './search-bar';
import { TagFilter } from './tag-filter';
import api from '@/lib/api';
import type { ContractTemplate, MarketplaceListResponse } from '@/lib/types';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

const LIMIT = 12;

export function TemplateGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page')) || 1;
  const searchQuery = searchParams.get('q') || '';
  const selectedTags = searchParams.get('tags')
    ? searchParams.get('tags')!.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const updateParams = useCallback(
    (updates: { q?: string; tags?: string[]; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.q !== undefined) {
        if (updates.q) params.set('q', updates.q);
        else params.delete('q');
      }
      if (updates.tags !== undefined) {
        if (updates.tags.length > 0) params.set('tags', updates.tags.join(','));
        else params.delete('tags');
      }
      if (updates.page !== undefined) {
        if (updates.page > 1) params.set('page', String(updates.page));
        else params.delete('page');
      }

      if ((updates.q !== undefined || updates.tags !== undefined) && updates.page === undefined) {
        params.delete('page');
      }

      const qs = params.toString();
      router.push(qs ? `/marketplace?${qs}` : '/marketplace');
    },
    [router, searchParams],
  );

  const tagsKey = selectedTags.join(',');

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: LIMIT,
      };
      if (searchQuery) params.q = searchQuery;
      if (selectedTags.length > 0) params.tags = selectedTags.join(',');

      const res = await api.get<MarketplaceListResponse>('/marketplace', { params });
      setTemplates(res.data.items);
      setTotal(res.data.total);
    } catch {
      setTemplates([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, tagsKey]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const totalPages = Math.ceil(total / LIMIT);

  const handleSearch = useCallback(
    (query: string) => {
      updateParams({ q: query });
    },
    [updateParams],
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateParams({ tags });
    },
    [updateParams],
  );

  const handlePageChange = (newPage: number) => {
    updateParams({ q: searchQuery || undefined, tags: selectedTags, page: newPage });
  };

  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} value={searchQuery} />
      <TagFilter selectedTags={selectedTags} onTagsChange={handleTagsChange} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No templates found. Try a different search.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <TemplateCard key={template._id} template={template} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>

              {getPageNumbers().map((pageNum, idx) =>
                pageNum === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={pageNum}
                    variant={pageNum === currentPage ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className="min-w-9"
                  >
                    {pageNum}
                  </Button>
                ),
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
