"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

/** Force a fresh server navigation once Clerk finishes establishing a session. */
export default function PostSignInRefresh() {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace("/");
    }
  }, [isLoaded, isSignedIn]);
  return null;
}
