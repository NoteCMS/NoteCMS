import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { gqlRequest } from '@/api/graphql';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Asset, Site } from '@/types/app';

type AssetsPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function AssetsPage({ token, workspaceSiteId, sites: _sites }: AssetsPageProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function loadAssets() {
    if (!workspaceSiteId) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await gqlRequest<{ listAssets: Asset[] }>(
        token,
        'query($siteId:ID!,$query:String){ listAssets(siteId:$siteId,query:$query){ id siteId uploadedBy filename mimeType sizeBytes width height alt title variants { original web thumbnail } createdAt updatedAt } }',
        { siteId: workspaceSiteId, query: search.trim() || undefined },
      );
      setAssets(response.listAssets);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, [workspaceSiteId]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !workspaceSiteId) return;

    setIsUploading(true);
    setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      await gqlRequest(
        token,
        'mutation($siteId:ID!,$fileBase64:String!,$filename:String!,$mimeType:String!){ uploadAsset(siteId:$siteId,fileBase64:$fileBase64,filename:$filename,mimeType:$mimeType){ id } }',
        {
          siteId: workspaceSiteId,
          fileBase64,
          filename: file.name,
          mimeType: file.type,
        },
      );
      await loadAssets();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload asset');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    if (!workspaceSiteId) return;
    setError('');
    try {
      await gqlRequest(token, 'mutation($id:ID!,$siteId:ID!){ deleteAsset(id:$id,siteId:$siteId) }', {
        id: assetId,
        siteId: workspaceSiteId,
      });
      await loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete asset');
    }
  }

  const sortedAssets = useMemo(() => assets, [assets]);

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search assets…"
              name="asset-search"
              aria-label="Search assets"
            />
            <Button variant="outline" onClick={() => void loadAssets()} disabled={isLoading || !workspaceSiteId}>
              Refresh
            </Button>
            <div>
              <Label htmlFor="asset-upload" className="sr-only">
                Upload image
              </Label>
              <Input id="asset-upload" type="file" accept="image/*" onChange={handleUpload} disabled={isUploading || !workspaceSiteId} />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive" aria-live="polite">{error}</p> : null}
          {isUploading ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}

          {!workspaceSiteId ? (
            <p className="text-sm text-muted-foreground">Select a workspace from the sidebar first.</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading assets…</p>
          ) : sortedAssets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedAssets.map((asset) => (
                <div key={asset.id} className="space-y-2 rounded-md border p-3">
                  <div className="aspect-video overflow-hidden rounded-md border bg-muted">
                    <img src={asset.variants.thumbnail} alt={asset.alt || asset.filename} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{asset.filename}</p>
                    <p className="text-xs text-muted-foreground">{asset.mimeType}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={asset.variants.original} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleDelete(asset.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No assets uploaded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
