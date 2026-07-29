import { isDonationUiRestricted, isElectronRenderer } from './app.constants';

describe('isDonationUiRestricted', () => {
  const cases: Array<
    [
      label: string,
      context: Parameters<typeof isDonationUiRestricted>[0],
      expected: boolean,
    ]
  > = [
    ['native iOS', { isIosNative: true, isElectron: false, isMacOS: false }, true],
    ['macOS Electron DMG', { isIosNative: false, isElectron: true, isMacOS: true }, true],
    [
      'macOS Electron App Store',
      { isIosNative: false, isElectron: true, isMacOS: true },
      true,
    ],
    [
      'macOS Electron development build',
      { isIosNative: false, isElectron: true, isMacOS: true },
      true,
    ],
    [
      'Windows or Linux Electron',
      { isIosNative: false, isElectron: true, isMacOS: false },
      false,
    ],
    [
      'macOS web browser',
      { isIosNative: false, isElectron: false, isMacOS: true },
      false,
    ],
    ['native Android', { isIosNative: false, isElectron: false, isMacOS: false }, false],
  ];

  cases.forEach(([label, context, expected]) => {
    it(`${expected ? 'restricts' : 'allows'} donation UI on ${label}`, () => {
      expect(isDonationUiRestricted(context)).toBe(expected);
    });
  });
});

const ELECTRON_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Electron/39.0.0';

const electronBridge = {
  getDistChannel: (): null => null,
  isAppleSilicon: (): boolean => false,
  isGnomeWayland: (): boolean => false,
  isMacOS: (): boolean => false,
};

describe('isElectronRenderer', () => {
  it('identifies the packaged app when the Electron bridge is available', () => {
    expect(isElectronRenderer(ELECTRON_USER_AGENT, electronBridge)).toBeTrue();
  });

  it('does not mistake an Electron-hosted web browser for the packaged app', () => {
    expect(isElectronRenderer(ELECTRON_USER_AGENT, undefined)).toBeFalse();
  });

  it('requires the complete platform bridge used during module startup', () => {
    expect(
      isElectronRenderer(ELECTRON_USER_AGENT, {
        getDistChannel: electronBridge.getDistChannel,
        isAppleSilicon: electronBridge.isAppleSilicon,
        isMacOS: electronBridge.isMacOS,
      }),
    ).toBeFalse();
  });

  it('does not identify a normal web user agent as Electron', () => {
    expect(
      isElectronRenderer('Mozilla/5.0 Chrome/150.0.0.0', electronBridge),
    ).toBeFalse();
  });
});
