export const APP_VERSION = __APP_VERSION__;

export function VersionFooter() {
  return <footer className="version-footer">整理券受付 v{APP_VERSION}</footer>;
}
