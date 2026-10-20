/** 海康 WebVideoCtrl 最小类型声明（仅覆盖初版用到的 API） */

interface HikLoginOptions {
  timeout?: number
  success?: (xmlDoc: unknown) => void
  error?: (oError: { errorCode?: number; errorMsg?: string } | number, xmlDoc?: unknown) => void
}

interface HikPlayOptions {
  iStreamType?: number
  iChannelID?: number
  bZeroChannel?: boolean
  success?: () => void
  error?: (oError: { errorCode?: number; errorMsg?: string }) => void
}

interface HikInitPluginOptions {
  bWndFull?: boolean
  iWndowType?: number
  iPackageType?: number
  szBasePath?: string
  cbSelWnd?: (xmlDoc: unknown) => void
  cbDoubleClickWnd?: (iWndIndex: number, bFullScreen: boolean) => void
  cbEvent?: (iEventType: number, iParam1: number, iParam2?: number) => void
  cbInitPluginComplete?: () => void
}

interface HikWindowStatus {
  szDeviceIdentify: string
}

interface WebVideoCtrlStatic {
  I_InitPlugin(options: HikInitPluginOptions): void
  I_InsertOBJECTPlugin(containerId: string): Promise<unknown>
  I_CheckPluginVersion?(): Promise<boolean>
  I_CheckPluginInstall?(): number
  I_Login(
    ip: string,
    protocol: number,
    port: string | number,
    username: string,
    password: string,
    options: HikLoginOptions,
  ): void
  I_Logout(deviceIdentify: string): Promise<unknown>
  I_StartRealPlay(
    deviceIdentify: string,
    options: HikPlayOptions & { iRtspPort?: number },
  ): void
  I_Stop(options?: { success?: () => void; error?: () => void }): void
  I_GetWindowStatus(wndIndex?: number): HikWindowStatus | null
  I_CapturePicData(): Promise<string>
  I_DestroyPlugin?(): void
  I_Resize?(width: number, height: number): void
  I_GetAudioInfo?(
    deviceIdentify: string,
    options: {
      success?: (xmlDoc: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
  I_StartVoiceTalk?(deviceIdentify: string, iAudioChannel: number): Promise<unknown>
  I_StopVoiceTalk?(): Promise<unknown>
  I_CloseSound?(wndIndex?: number): Promise<unknown>
  I_SendHTTPRequest?(
    deviceIdentify: string,
    uri: string,
    options: {
      type?: string
      data?: string
      success?: (data?: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): Promise<unknown>
  I_GetDevicePort?(deviceIdentify: string): Promise<{ iDevicePort?: number; iRtspPort?: number }>
  I_GetAnalogChannelInfo?(
    deviceIdentify: string,
    options: {
      success?: (xmlDoc: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
  I_GetDigitalChannelInfo?(
    deviceIdentify: string,
    options: {
      success?: (xmlDoc: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
  /** PTZ：iPTZIndex 1-9 方向/自动，10/11 变焦；bStop 为 true 时停止 */
  I_PTZControl?(
    iPTZIndex: number,
    bStop: boolean,
    options?: {
      iPTZSpeed?: number
      success?: () => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
  I_SetPreset?(
    iPresetID: number,
    options?: {
      success?: (xmlDoc?: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
  I_GoPreset?(
    iPresetID: number,
    options?: {
      success?: (xmlDoc?: unknown) => void
      error?: (oError?: { errorCode?: number; errorMsg?: string }) => void
    },
  ): void
}

interface Window {
  WebVideoCtrl?: WebVideoCtrlStatic
  $?: unknown
}
