/** 面板只下载共享缩略图；表单、提交与框选保留同帧原图地址。 */
export function panelPreviewUrl(original: string): string {
  const name = original.match(/^\/api\/images\/session_assets\/([0-9a-f]{64}\.(?:jpg|png))$/)?.[1]
  return name ? `/api/panel-images/preview/${name}` : original
}
