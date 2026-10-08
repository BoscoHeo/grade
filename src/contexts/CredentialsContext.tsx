import React, { createContext, useContext, useState } from "react";
import { initializeCredentials, updateCredential, type PageCredentials } from "../services/credentials";

interface CredentialsContextValue {
  credentials: PageCredentials;
  setCredential: (field: keyof PageCredentials, value: string) => void;
}
const CredentialsContext = createContext<CredentialsContextValue | null>(null);

export function CredentialsProvider({ children }: { children: React.ReactNode }) {
  const [credentials, setCredentials] = useState<PageCredentials>(() => initializeCredentials());
  const setCredential = (field: keyof PageCredentials, value: string) => {
    setCredentials((current) => updateCredential(current, field, value));
  };
  return <CredentialsContext.Provider value={{ credentials, setCredential }}>{children}</CredentialsContext.Provider>;
}

export function usePageCredentials() {
  const value = useContext(CredentialsContext);
  if (!value) throw new Error("CredentialsProvider가 필요합니다.");
  return value;
}
