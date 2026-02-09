/** Ambient types for the Google Picker API and Google Identity Services. */

// ---------- gapi ----------
declare namespace gapi {
  function load(api: string, callback: () => void): void;
}

declare namespace google.picker {
  class PickerBuilder {
    constructor();
    addView(view: View | DocsView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    setCallback(callback: (data: CallbackData) => void): PickerBuilder;
    enableFeature(feature: Feature): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    setSize(width: number, height: number): PickerBuilder;
    build(): Picker;
  }

  interface Picker {
    setVisible(visible: boolean): void;
    dispose(): void;
  }

  class DocsView {
    constructor(viewId?: ViewId);
    setMimeTypes(mimeTypes: string): DocsView;
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
    setMode(mode: DocsViewMode): DocsView;
  }

  class View {
    constructor(viewId: ViewId);
  }

  enum ViewId {
    DOCS = "all",
    DOCS_IMAGES = "docs-images",
    DOCS_VIDEOS = "docs-videos",
    FOLDERS = "folders",
  }

  enum DocsViewMode {
    GRID = "grid",
    LIST = "list",
  }

  enum Feature {
    MULTISELECT_ENABLED = "multiselect",
    NAV_HIDDEN = "navhidden",
  }

  enum Action {
    CANCEL = "cancel",
    PICKED = "picked",
  }

  interface CallbackData {
    action: Action | string;
    docs?: Document[];
  }

  interface Document {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    type: string;
    url: string;
  }

  const Response: {
    ACTION: "action";
    DOCUMENTS: "docs";
  };

  const Document: {
    ID: "id";
    NAME: "name";
    MIME_TYPE: "mimeType";
    TYPE: "type";
  };
}

// ---------- Google Identity Services (GIS) ----------
declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken(overrideConfig?: { prompt?: string }): void;
    callback: (response: TokenResponse) => void;
  }

  interface TokenResponse {
    access_token: string;
    error?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message: string }) => void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
}
