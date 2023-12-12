import { useSignIn, useSignUp } from '@clerk/clerk-react';
import type { OAuthStrategy, SetActive, SignInResource, SignUpResource } from '@clerk/types';
import * as WebBrowser from 'react-native-inappbrowser-reborn';

export type UseOAuthFlowParams = {
  strategy: OAuthStrategy;
  redirectUrl?: string;
  unsafeMetadata?: SignUpUnsafeMetadata;
};

export type StartOAuthFlowParams = {
  redirectUrl?: string;
  unsafeMetadata?: SignUpUnsafeMetadata;
};

export type StartOAuthFlowReturnType = {
  createdSessionId: string;
  setActive?: SetActive;
  signIn?: SignInResource;
  signUp?: SignUpResource;
  authSessionResult?: WebBrowser.BrowserResult | WebBrowser.RedirectResult;
};

export function useOAuth(useOAuthParams: UseOAuthFlowParams) {
  const { strategy } = useOAuthParams || {};
  if (!strategy) {
    throw new Error('Missing oauth strategy');
  }

  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();

  async function startOAuthFlow(
    startOAuthFlowParams?: StartOAuthFlowParams,
  ): Promise<StartOAuthFlowReturnType> {
    if (!isSignInLoaded || !isSignUpLoaded) {
      return {
        createdSessionId: '',
        signIn,
        signUp,
        setActive,
      };
    }

    // Create a redirect url for the current platform and environment.
    //
    // This redirect URL needs to be whitelisted for your Clerk production instance via
    // https://clerk.com/docs/reference/backend-api/tag/Redirect-URLs#operation/CreateRedirectURL
    //
    const oauthRedirectUrl = startOAuthFlowParams?.redirectUrl || useOAuthParams.redirectUrl;

    if (!oauthRedirectUrl) {
      throw new Error('Missing oauth redirect url');
    }

    await signIn.create({ strategy, redirectUrl: oauthRedirectUrl });

    const { externalVerificationRedirectURL } = signIn.firstFactorVerification;

    const authSessionResult = await WebBrowser.InAppBrowser.openAuth(
      externalVerificationRedirectURL!.toString(),
      oauthRedirectUrl,
      { ephemeralWebSession: true },
    );

    // @ts-expect-error URL should exist here
    const { type, url } = authSessionResult || {};

    // TODO: Check all the possible AuthSession results
    // https://docs.expo.dev/versions/latest/sdk/auth-session/#returns-7
    if (type !== 'success') {
      return {
        authSessionResult,
        createdSessionId: '',
        setActive,
        signIn,
        signUp,
      };
    }

    const params = new URL(url).searchParams;

    const rotatingTokenNonce = params.get('rotating_token_nonce') || '';
    await signIn.reload({ rotatingTokenNonce });

    const { status, firstFactorVerification } = signIn;

    let createdSessionId = '';

    if (status === 'complete') {
      createdSessionId = signIn.createdSessionId!;
    } else if (firstFactorVerification.status === 'transferable') {
      await signUp.create({
        transfer: true,
        unsafeMetadata: startOAuthFlowParams?.unsafeMetadata || useOAuthParams.unsafeMetadata,
      });
      createdSessionId = signUp.createdSessionId || '';
    }

    return {
      authSessionResult,
      createdSessionId,
      setActive,
      signIn,
      signUp,
    };
  }

  return {
    startOAuthFlow,
  };
}
