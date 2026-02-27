interface ErrorWithCause {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

function isModuleNotFoundError(
  error: unknown,
  peerDependency: string,
  depth = 0
): boolean {
  if (!error || typeof error !== "object" || depth > 3) {
    return false;
  }

  const candidate = error as ErrorWithCause;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  const normalized = message.toLowerCase();
  const referencesPeer = message.includes(peerDependency);

  if (
    referencesPeer &&
    (code === "ERR_MODULE_NOT_FOUND" ||
      code === "MODULE_NOT_FOUND" ||
      normalized.includes("cannot find module") ||
      normalized.includes("unable to resolve module") ||
      normalized.includes("failed to resolve module"))
  ) {
    return true;
  }

  return isModuleNotFoundError(candidate.cause, peerDependency, depth + 1);
}

export async function loadOptionalPeerDependency<TModule>(options: {
  peerDependency: string;
  feature: string;
  load: () => Promise<TModule>;
  installCommand?: string;
}): Promise<TModule> {
  try {
    return await options.load();
  } catch (error) {
    if (isModuleNotFoundError(error, options.peerDependency)) {
      const installCommand =
        options.installCommand ?? `npm install ${options.peerDependency}`;
      throw new Error(
        `Missing optional peer dependency "${options.peerDependency}" required for ${options.feature}. Install it with \`${installCommand}\`.`
      );
    }
    throw error;
  }
}
