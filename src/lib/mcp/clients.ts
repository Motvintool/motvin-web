/**
 * The AI tools Motvin MCP has setup guides for: the cards on /mcp, the list
 * on /mcp/clients and one guide page each at /mcp/clients/<id>.
 *
 * Icons are single paths on a 24×24 grid, drawn with `currentColor` — brand
 * marks from Simple Icons (CC0) and, for Devin and Antigravity, LobeHub Icons
 * (MIT); each mark belongs to its owner. Two are drawn here: a terminal prompt
 * for Codex and a plug for "other clients".
 *
 * In steps and code, `{url}` is replaced with the server address for where
 * the page is opened (the local backend while developing, api.motvin.com
 * live), so a copied command always works.
 */

export const MCP_ICONS = {
  "claude": "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  "cursor": "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
  "openai": "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  "gemini": "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  "copilot": "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z",
  "vscode": "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z",
  "windsurf": "M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z",
  "replit": "M2 1.5A1.5 1.5 0 0 1 3.5 0h7A1.5 1.5 0 0 1 12 1.5V8H3.5A1.5 1.5 0 0 1 2 6.5ZM12 8h8.5A1.5 1.5 0 0 1 22 9.5v5a1.5 1.5 0 0 1-1.5 1.5H12ZM2 17.5A1.5 1.5 0 0 1 3.5 16H12v6.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 22.5Z",
  "figma": "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z",
  "devin": "M2.033 9.867l2.554 1.483a.589.589 0 00.592 0l2.554-1.483.01-.008a.608.608 0 00.11-.084l.013-.015a.631.631 0 00.076-.1c.003-.005.008-.01.01-.016a.558.558 0 00.052-.125l.007-.028a.611.611 0 00.019-.14V7.868c0-.572.307-1.105.8-1.392a1.595 1.595 0 011.598 0l1.277.742a.54.54 0 00.129.053l.028.01c.044.01.088.015.133.016h.006l.013-.002a.587.587 0 00.27-.074l.011-.004 2.554-1.483a.596.596 0 00.297-.516V2.253a.595.595 0 00-.297-.516L12.293.257a.587.587 0 00-.591 0L9.148 1.737l-.01.01a.609.609 0 00-.109.083l-.014.015a.632.632 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.028a.612.612 0 00-.018.14v1.483c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.603.603 0 00-.13-.053l-.028-.008a.658.658 0 00-.133-.018h-.02a.57.57 0 00-.269.074c-.003.002-.008.002-.012.005L2.033 5.872a.596.596 0 00-.297.515v2.966c0 .213.113.41.297.515zM15.943 10.607a1.596 1.596 0 011.599 0l1.276.74c.041.025.085.04.13.055l.028.008c.043.01.088.016.133.018h.005c.005 0 .01-.002.014-.003a.474.474 0 00.122-.016l.021-.005a.616.616 0 00.126-.052c.004-.002.009-.002.013-.005l2.554-1.482a.597.597 0 00.297-.516V6.383a.596.596 0 00-.297-.515l-2.552-1.483a.587.587 0 00-.592 0l-2.553 1.482-.011.008a.61.61 0 00-.108.084l-.014.016a.637.637 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.029a.612.612 0 00-.018.14v1.482c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.584.584 0 00-.13-.053l-.028-.008a.62.62 0 00-.133-.018h-.02a.587.587 0 00-.269.074l-.012.004L9.15 10a.596.596 0 00-.296.516v2.966c0 .212.112.409.296.515l2.554 1.483s.008.002.012.005c.04.022.082.04.126.052l.02.004a.57.57 0 00.123.017l.014.002h.006c.054 0 .108-.01.16-.025a.587.587 0 00.13-.054l1.277-.741a1.597 1.597 0 012.398 1.392v1.482c0 .049.007.095.019.14l.007.028a.619.619 0 00.051.125c.004.006.008.01.01.016a.6.6 0 00.076.1l.014.015c.033.032.069.06.108.084.004.002.006.006.011.008l2.554 1.483a.59.59 0 00.593 0l2.554-1.483a.597.597 0 00.296-.516v-2.965a.595.595 0 00-.296-.516l-2.554-1.483s-.008-.002-.012-.005a.54.54 0 00-.126-.051c-.007-.003-.013-.003-.02-.005a.635.635 0 00-.125-.017h-.018a.557.557 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.595 1.595 0 01-1.598 0 1.615 1.615 0 010-2.785l-.005-.001zM14.848 18.265l-2.554-1.482-.012-.005a.526.526 0 00-.126-.052c-.007-.002-.014-.002-.02-.005a.64.64 0 00-.124-.017h-.02a.56.56 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.594 1.594 0 01-1.598 0c-.493-.286-.8-.82-.8-1.393V14.65a.563.563 0 00-.018-.14l-.008-.028a.604.604 0 00-.051-.124l-.01-.017a.603.603 0 00-.076-.1l-.014-.015a.596.596 0 00-.109-.084c-.003-.002-.005-.006-.01-.008L5.178 12.65a.587.587 0 00-.591 0l-2.554 1.483a.596.596 0 00-.297.516v2.965c0 .213.113.41.297.516l2.554 1.483.012.004a.618.618 0 00.267.074l.016.002h.007a.55.55 0 00.16-.026.584.584 0 00.129-.053l1.277-.742a1.597 1.597 0 012.398 1.393v1.482c0 .05.007.095.019.14l.007.028c.013.044.03.085.051.125l.01.016c.022.036.047.07.076.1l.014.015c.032.032.069.06.109.084l.01.008 2.554 1.483a.587.587 0 00.593 0l2.554-1.483a.596.596 0 00.296-.515v-2.966a.596.596 0 00-.296-.516h-.002z",
  "antigravity": "M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z",
  "codex": "",
  "other": "M9 2h2v5h2V2h2v5h1a2 2 0 0 1 2 2v3a6 6 0 0 1-5 5.9V22h-2v-4.1A6 6 0 0 1 6 12V9a2 2 0 0 1 2-2h1V2Z"
} as const;

export type McpIconId = keyof typeof MCP_ICONS;

export type ClientStep = {
  /** The instruction. `**bold**` marks a menu or button name; backticks mark a command or file name. */
  text: string;
  /** Finer points under the step. */
  sub?: string[];
  /** A command or config to copy, shown under the step. */
  code?: string;
};

/** How the tool lists are grouped: by where Motvin gets added. */
export type ClientGroup = 'terminal' | 'editor' | 'web';

export const CLIENT_GROUPS: { id: ClientGroup; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'editor', label: 'Editors' },
  { id: 'web', label: 'Web apps' },
];

/** The tools a link can open with Motvin filled in. */
export type InstallKind = 'cursor' | 'vscode' | 'claude-web' | 'replit-web';

export type McpClient = {
  id: string;
  name: string;
  icon: McpIconId;
  /** The brand colour the mark is drawn in on cards and guides (Simple Icons' where it has one). */
  color: string;
  /** One line under the title. */
  intro: string;
  steps: ClientStep[];
  /** A highlighted note after the steps. */
  note?: string;
  /** The tool can add Motvin from a link (one-click install); see installLink. */
  install?: InstallKind;
  /**
   * No install link: what the one-click button copies instead — a terminal command,
   * or a config snippet and the file it goes in. Without it, the server address.
   */
  quickCopy?: { kind: 'command'; value: string } | { kind: 'config'; value: string; file: string };
  /** After copying, also open this — a web page in a new tab, or an app by its link (e.g. antigravity-ide://). */
  quickOpen?: string;
  /** Where it sits in the tool lists; "Other clients" has none and comes last. */
  group?: ClientGroup;
  /** Replaced by a newer tool; listed with a "Legacy" tag. */
  legacy?: boolean;
  /** How to take Motvin out of the tool itself, for the guide's "Disconnect or remove". */
  remove: ClientStep;
  /** Fixes only this tool needs, listed first under Troubleshooting (one with the same question replaces the general answer), so the steps stay on the main path. */
  help?: { q: string; a: string }[];
};

/**
 * A link that opens the tool with Motvin's server filled in, for the tools that
 * support one-click MCP install. The person confirms in the tool, then signs in.
 * - Cursor: cursor://anysphere.cursor-deeplink/mcp/install with the config as base64 JSON.
 * - VS Code: vscode:mcp/install with the config as URL-encoded JSON.
 * - Claude (web): claude.ai's own prefill link opens "Add custom connector" with the
 *   name and address filled in; connectors added there show in the desktop app too.
 * - Replit (web): replit.com/integrations?mcp= with base64 JSON opens "Add MCP server"
 *   with the name and address filled in.
 */
export function installLink(kind: InstallKind, url: string): string {
  if (kind === 'replit-web') {
    const json = JSON.stringify({ displayName: 'Motvin', baseUrl: url });
    const config = typeof window === 'undefined' ? Buffer.from(json).toString('base64') : btoa(json);
    return `https://replit.com/integrations?mcp=${encodeURIComponent(config)}`;
  }
  if (kind === 'claude-web') {
    return `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Motvin&connectorUrl=${encodeURIComponent(url)}`;
  }
  if (kind === 'cursor') {
    const config = typeof window === 'undefined' ? Buffer.from(JSON.stringify({ url })).toString('base64') : btoa(JSON.stringify({ url }));
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=motvin&config=${encodeURIComponent(config)}`;
  }
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'motvin', type: 'http', url }))}`;
}

export const MCP_CLIENTS: McpClient[] = [
  {
    id: 'claude-code',
    group: 'terminal',
    remove: { text: 'To remove Motvin from Claude Code completely, run this in your terminal:', code: 'claude mcp remove motvin' },
    name: 'Claude Code',
    icon: 'claude',
    color: '#D97757',
    intro: 'Add Motvin to Claude Code from your terminal, then sign in once.',
    steps: [
      { text: 'New to Claude Code? Install it first in your terminal:', code: 'npm install -g @anthropic-ai/claude-code' },
      { text: 'Then add Motvin:', code: 'claude mcp add --transport http --scope user motvin {url}' },
      { text: 'Start Claude Code in your terminal:', code: 'claude' },
      { text: 'Inside Claude Code (not your terminal), type this, then choose **motvin** → **Authenticate**:', code: '/mcp' },
      { text: 'A browser window opens on motvin.com. Sign in with your Motvin account and click **Allow**.' },
    ],
  },
  {
    id: 'codex',
    group: 'terminal',
    remove: { text: 'To remove Motvin from Codex completely, run this in your terminal:', code: 'codex mcp remove motvin' },
    name: 'Codex',
    icon: 'codex',
    color: '#141414',
    intro: 'Add Motvin to Codex from your terminal, then sign in once.',
    steps: [
      { text: 'New to Codex? Install it first in your terminal, then run `codex` once to sign in with your ChatGPT account:', code: 'npm install -g @openai/codex' },
      { text: 'Then add Motvin:', code: 'codex mcp add motvin --url {url}' },
      { text: 'A browser window opens on motvin.com. Sign in with your Motvin account and click **Allow**.' },
      { text: 'Start Codex in your terminal:', code: 'codex' },
    ],
    help: [
      { q: 'The browser didn’t open', a: 'Run `codex mcp login motvin` in your terminal.' },
      { q: 'Codex says “authentication required”', a: 'Inside Codex, type `/mcp login motvin` and sign in again.' },
    ],
  },
  {
    id: 'github-copilot-cli',
    group: 'terminal',
    remove: { text: 'To remove Motvin from Copilot CLI completely, run this in your terminal:', code: 'copilot mcp remove motvin' },
    name: 'GitHub Copilot CLI',
    icon: 'copilot',
    color: '#141414',
    intro: 'Add Motvin to Copilot CLI from your terminal, then sign in once.',
    steps: [
      { text: 'New to Copilot CLI? Install it first in your terminal, then run `copilot` once to sign in with GitHub:', code: 'npm install -g @github/copilot' },
      { text: 'Then add Motvin:', code: 'copilot mcp add --transport http motvin {url}' },
      { text: 'Start Copilot CLI in your terminal:', code: 'copilot' },
      { text: 'Inside Copilot CLI (not your terminal), type:', code: '/mcp auth motvin' },
      { text: 'Sign in with your Motvin account in the browser and click **Allow**.' },
    ],
  },
  {
    id: 'antigravity-cli',
    group: 'terminal',
    remove: { text: 'To remove Motvin from Antigravity CLI completely, run this in your terminal:', code: 'agy mcp remove motvin' },
    help: [
      { q: 'It says “agy: command not found”', a: 'Run the `export PATH` line the installer printed under **Warning**, then open a new terminal window.' },
      { q: 'Choosing motvin only restarts it', a: 'Pick **Authenticate**, not **Restart**. Restart reconnects without signing in.' },
    ],
    name: 'Antigravity CLI',
    icon: 'antigravity',
    color: '#4285F4',
    intro: 'Add Motvin to Antigravity CLI from your terminal, then sign in once.',
    steps: [
      { text: 'New to Antigravity CLI? Install it first in your terminal, then run `agy` once to sign in with Google:', code: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' },
      { text: 'Then add Motvin:', code: 'agy mcp add motvin {url}' },
      { text: 'Start Antigravity CLI in your terminal:', code: 'agy' },
      { text: 'Inside Antigravity CLI (not your terminal), type:', code: '/mcp' },
      { text: 'Move to **motvin** with **↓**, press **Enter**, then choose **Authenticate**.' },
      { text: 'A browser window opens on motvin.com. Sign in with your Motvin account and click **Allow**.' },
    ],
  },
  {
    id: 'gemini-cli',
    group: 'terminal',
    legacy: true,
    remove: { text: 'To remove Motvin from Gemini CLI completely, run this in your terminal:', code: 'gemini mcp remove -s user motvin' },
    help: [{ q: '“Sign in with Google” fails', a: 'Google turned it off for personal accounts. Choose **Use Gemini API Key** (free at aistudio.google.com/apikey), or use the Antigravity CLI guide instead.' }],
    name: 'Gemini CLI',
    icon: 'gemini',
    color: '#8E75B2',
    intro: 'Add Motvin to Gemini CLI from your terminal, then sign in from inside it.',
    steps: [
      { text: 'New to Gemini CLI? Install it first in your terminal, then run `gemini` once and choose **Use Gemini API Key**:', code: 'npm install -g @google/gemini-cli' },
      { text: 'Then add Motvin:', code: 'gemini mcp add -s user --transport http motvin {url}' },
      { text: 'Start Gemini CLI in your terminal:', code: 'gemini' },
      { text: 'Inside Gemini CLI (not your terminal), type:', code: '/mcp auth motvin' },
      { text: 'Sign in with your Motvin account in the browser and click **Allow**.' },
    ],
  },
  {
    id: 'cursor',
    group: 'editor',
    remove: { text: 'To remove Motvin from Cursor completely, delete the motvin entry from `~/.cursor/mcp.json`, or just turn it off in **Customize** → **MCPs**.' },
    name: 'Cursor',
    icon: 'cursor',
    color: '#141414',
    install: 'cursor',
    intro: 'Add Motvin to Cursor’s MCP settings, then sign in once.',
    steps: [
      { text: 'Open **Customize** in the sidebar → **MCPs**, or open `~/.cursor/mcp.json` directly.' },
      { text: 'Add Motvin and save the file:', code: '{\n  "mcpServers": {\n    "motvin": { "url": "{url}" }\n  }\n}' },
      { text: 'In **Customize** → **MCPs**, turn motvin on.' },
      { text: 'Sign in with your Motvin account in the browser and click **Allow**.' },
    ],
  },
  {
    id: 'vscode',
    group: 'editor',
    remove: { text: 'To remove Motvin from VS Code completely, run **MCP: List Servers** from the Command Palette, pick motvin and choose **Uninstall**.' },
    name: 'VS Code',
    icon: 'vscode',
    color: '#007ACC',
    install: 'vscode',
    intro: 'Add Motvin to VS Code for use with Copilot’s agent mode.',
    steps: [
      { text: 'Open the Command Palette and run **MCP: Add Server**.' },
      { text: 'Choose **HTTP**, paste the server address, enter **motvin** as the server ID and choose **Global**:', code: '{url}' },
      { text: 'Run **MCP: List Servers**, pick motvin and choose **Start Server**. Sign in with your Motvin account in the browser and click **Allow**.' },
    ],
  },
  {
    id: 'antigravity-ide',
    group: 'editor',
    // No install link exists, so the button copies the config and then opens the app.
    quickOpen: 'antigravity-ide://',
    quickCopy: { kind: 'config', value: '{\n  "mcpServers": {\n    "motvin": { "serverUrl": "{url}" }\n  }\n}', file: '~/.gemini/config/mcp_config.json' },
    remove: { text: 'To remove Motvin from Antigravity IDE completely, open **…** → **MCP Servers**, click **More actions** (**⋮**) next to motvin and choose **Delete**.' },
    help: [{ q: 'Antigravity asks for a code', a: 'Paste it into **Enter authorization code** and click **Submit**.' }],
    name: 'Antigravity IDE',
    icon: 'antigravity',
    color: '#4285F4',
    intro: 'Add Motvin to the Antigravity IDE, Google’s AI code editor.',
    steps: [
      { text: 'New to Antigravity? Download the app from **antigravity.google**, open it and sign in with your Google account.' },
      { text: 'Click the **…** at the top right of the **Agent** panel → **MCP Servers** → **View raw config**. Paste this into the file that opens (`~/.gemini/config/mcp_config.json`) and save:', code: '{\n  "mcpServers": {\n    "motvin": { "serverUrl": "{url}" }\n  }\n}' },
      { text: 'Back in **Manage MCP servers**, click **Refresh**, then **Authenticate** next to motvin.' },
      { text: 'Sign in with your Motvin account and click **Allow**.' },
    ],
  },
  {
    id: 'windsurf',
    group: 'editor',
    quickCopy: { kind: 'config', value: '{\n  "mcpServers": {\n    "motvin": { "url": "{url}" }\n  }\n}', file: 'mcp_config.json' },
    remove: { text: 'To remove Motvin from Devin Desktop completely, delete the motvin entry from `~/.config/devin/mcp_config.json`, save, and refresh the list in **Customize** → **MCPs**.' },
    // Windsurf was renamed Devin Desktop in June 2026; the id stays so old links work.
    name: 'Devin Desktop',
    icon: 'devin',
    color: '#3969CA',
    intro: 'Add Motvin to Devin Desktop (formerly Windsurf) for use with Cascade.',
    steps: [
      { text: 'Open **Customize** → **MCPs** and open the config file, `~/.config/devin/mcp_config.json`.' },
      { text: 'Add Motvin and save:', code: '{\n  "mcpServers": {\n    "motvin": { "url": "{url}" }\n  }\n}' },
      { text: 'Refresh the list, click **Authenticate** next to motvin, then sign in with your Motvin account and click **Allow**.' },
    ],
  },
  {
    id: 'chatgpt',
    group: 'web',
    remove: { text: 'To remove Motvin from ChatGPT completely, open **Plugins** → **Installed**, click Motvin and remove it.' },
    name: 'ChatGPT',
    quickOpen: 'https://chatgpt.com/plugins',
    icon: 'openai',
    color: '#10A37F',
    intro: 'Add Motvin as a custom MCP server from ChatGPT’s Plugins page.',
    steps: [
      { text: 'In ChatGPT on the web, open **Plugins**.' },
      { text: 'Click **Add** at the top right, then **Add custom MCP server**.' },
      { text: 'Name it **Motvin**, paste the address under **Server URL** and choose **OAuth** under **Authentication**:', code: '{url}' },
      { text: 'Click **I understand and want to continue**, then **Create as a plugin**.' },
      { text: 'Install Motvin from your plugins, then sign in with your Motvin account and click **Allow**.' },
    ],
    note: 'Don’t see **Add custom MCP server**? Your ChatGPT plan or workspace may not offer it yet.',
  },
  {
    id: 'claude',
    group: 'web',
    remove: { text: 'To remove Motvin from Claude completely, open **Customize** → **Connectors**, click Motvin’s **⋯** menu and choose **Remove**.' },
    name: 'Claude',
    install: 'claude-web',
    icon: 'claude',
    color: '#D97757',
    intro: 'Add Motvin as a custom connector in Claude on the web or the desktop app.',
    steps: [
      { text: 'Open **Customize** → **Connectors**, click **Add**, then **Add custom connector**.' },
      { text: 'Name it **Motvin**, paste the server address and click **Continue**:', code: '{url}' },
      { text: 'Keep the options marked **Detected**, click **Add**, then **Connect**.' },
      { text: 'Sign in with your Motvin account and click **Allow**.' },
    ],
    note: 'To use it, open **Connectors** in a chat and turn Motvin on. On Team plans, an owner adds Motvin first.',
  },
  {
    id: 'figma',
    group: 'web',
    remove: { text: 'To remove Motvin from Figma completely, open **Add context** → **Connectors** in a Make file and delete Motvin under **Created by you**.' },
    name: 'Figma',
    // Connectors are added from inside a Make chat, so this opens Figma Make to start one.
    quickOpen: 'https://www.figma.com/make/',
    icon: 'figma',
    color: '#F24E1E',
    intro: 'Add Motvin as a connector in Figma Make.',
    note: 'Don’t see **Create connector**? It needs a paid Figma plan, and your admin may need to turn it on.',
    steps: [
      { text: 'Open a Figma Make file and click **Add context** → **Connectors**.' },
      { text: 'Under **Created by you**, click **Create connector**.' },
      { text: 'Name it **Motvin** and paste the server address:', code: '{url}' },
      { text: 'Click **Create**, then **Connect**. Sign in with your Motvin account and click **Allow**.' },
    ],
  },
  {
    id: 'replit',
    group: 'web',
    remove: { text: 'To remove Motvin from Replit completely, delete it in **Settings** → **Integrations** → **Your integrations**.' },
    name: 'Replit',
    install: 'replit-web',
    icon: 'replit',
    color: '#F26207',
    intro: 'Add Motvin to the Replit Agent’s MCP servers.',
    steps: [
      { text: 'In Replit, open **Settings** → **Integrations** → **Your integrations**, click **Add custom**, then **Add personal MCP server**.' },
      { text: 'Name it **Motvin**, paste the server address and click **Test & save**:', code: '{url}' },
      { text: 'Sign in with your Motvin account when asked and click **Allow**.' },
    ],
  },
  {
    id: 'other',
    remove: { text: 'To remove Motvin from your tool completely, delete it in the same MCP settings where you added it.' },
    name: 'Other clients',
    icon: 'other',
    color: '#55555c',
    intro: 'Any tool that supports MCP over HTTP with OAuth sign-in can connect to Motvin.',
    steps: [
      { text: 'Find the **MCP**, **connectors** or **integrations** section in your tool’s settings.' },
      { text: 'Add an HTTP MCP server with the address:', code: '{url}' },
      { text: 'On first use a browser window opens on motvin.com. Sign in with your Motvin account and click **Allow**.' },
    ],
  },
];

/** The nine tools on the /mcp page; the tenth card is "See all". */
export const FEATURED_CLIENT_IDS = ['claude-code', 'claude', 'cursor', 'codex', 'chatgpt', 'vscode', 'antigravity-cli', 'windsurf', 'figma'];

export function getClient(id: string): McpClient | undefined {
  return MCP_CLIENTS.find((client) => client.id === id);
}

/** What to try once connected; shown on every guide. */
export const USAGE_PROMPTS = [
  'Search Motvin for onboarding screens from fintech apps on iOS',
  'Show me 5 paywalls and tell me what they have in common',
  'How do food apps handle checkout? Walk me through a real flow',
];
