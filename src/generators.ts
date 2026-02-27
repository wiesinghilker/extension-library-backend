import { MittwaldAPIV2 } from "@mittwald/api-client";
import crypto from "crypto";

export const sshHostname = (
  project: MittwaldAPIV2.Components.Schemas.ProjectProject,
) => {
  return `ssh.${project.clusterId ?? ""}.${project.clusterDomain ?? ""}`;
};

export const sshUsername = (
  app: MittwaldAPIV2.Components.Schemas.AppAppInstallation,
  sshUser: MittwaldAPIV2.Components.Schemas.SshuserSshUser,
) => {
  return `${sshUser.userName}@${app.shortId}`;
};

export const sshUsernameForApp = (
  appShortId: string,
  sshUser: MittwaldAPIV2.Components.Schemas.SshuserSshUser,
) => {
  return `${sshUser.userName}@${appShortId}`;
};

export const sshUsernameForContainer = (
  containerShortId: string,
  sshUser: MittwaldAPIV2.Components.Schemas.SshuserSshUser,
) => {
  return `${sshUser.userName}@${containerShortId}`;
};

export const sshPassword = () => {
  return crypto.randomBytes(32).toString("base64").slice(0, 32);
};

export const appFullInstallationPath = (
  app: MittwaldAPIV2.Components.Schemas.AppAppInstallation,
) => {
  return `/html${app.installationPath}`;
};

export const pathToUserIni = (
  app: MittwaldAPIV2.Components.Schemas.AppAppInstallation,
) => {
  const appInstallDir = appFullInstallationPath(app);
  return `${appInstallDir}/.user.ini`;
};
