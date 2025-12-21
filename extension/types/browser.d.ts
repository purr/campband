// Browser extension API types for Firefox
declare namespace browser {
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }>;
      set(items: { [key: string]: any }): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
      onChanged: {
        addListener(callback: (changes: { [key: string]: StorageChange }) => void): void;
        removeListener(callback: (changes: { [key: string]: StorageChange }) => void): void;
      };
    }

    interface StorageChange {
      oldValue?: any;
      newValue?: any;
    }

    const local: StorageArea;
    const sync: StorageArea;
  }

  namespace runtime {
    function getURL(path: string): string;
    function sendMessage(message: any): Promise<any>;
    interface MessageListener {
      (message: any, sender: any, sendResponse: (response?: any) => void): void;
    }
    const onMessage: {
      addListener(callback: MessageListener): void;
      removeListener(callback: MessageListener): void;
    };
  }

  const browserAction: {
    onClicked: {
      addListener(callback: (tab: any) => void): void;
    };
  };

  namespace tabs {
    function query(queryInfo: any): Promise<any[]>;
    function create(createProperties: any): Promise<any>;
    function update(tabId: number, updateProperties: any): Promise<any>;
    function get(tabId: number): Promise<any>;
  }

  namespace windows {
    function get(windowId: number): Promise<any>;
    function update(windowId: number, updateProperties: any): Promise<any>;
  }
}
