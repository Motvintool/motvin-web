/**
 * Search and categorisation data for the icons library, extracted verbatim from
 * motvin-ui/JS/motvin-icons.js.
 *
 * ICON_CATEGORY_MAP drives categorisation: an item's name and tags are matched
 * against each category's keywords in declaration order, and the first hit
 * wins — so the order here is significant, not alphabetical.
 *
 * SEARCH_SYNONYMS expands a query into related terms, so searching
 * notification also surfaces bell and alert icons.
 */

export const ICON_CATEGORY_MAP: Readonly<Record<string, readonly string[]>> = {
  "Arrows": [
    "arrow",
    "chevron",
    "caret",
    "direction",
    "point",
    "up",
    "down",
    "left",
    "right",
    "forward",
    "back",
    "next",
    "prev"
  ],
  "Communication": [
    "phone",
    "mail",
    "chat",
    "message",
    "envelope",
    "call",
    "speech",
    "comment",
    "send",
    "wifi",
    "signal",
    "network",
    "bluetooth"
  ],
  "Media": [
    "play",
    "pause",
    "stop",
    "video",
    "music",
    "audio",
    "sound",
    "volume",
    "speaker",
    "mic",
    "cast"
  ],
  "People": [
    "user",
    "person",
    "people",
    "avatar",
    "profile",
    "face",
    "group",
    "man",
    "woman",
    "boy",
    "girl"
  ],
  "Business": [
    "briefcase",
    "office",
    "chart",
    "graph",
    "money",
    "dollar",
    "euro",
    "coin",
    "wallet",
    "trend",
    "bag"
  ],
  "Weather": [
    "sun",
    "moon",
    "cloud",
    "rain",
    "snow",
    "wind",
    "lightning",
    "weather",
    "storm",
    "temp"
  ],
  "Device": [
    "laptop",
    "mobile",
    "phone",
    "tablet",
    "screen",
    "monitor",
    "keyboard",
    "mouse",
    "battery",
    "cpu",
    "device",
    "desktop",
    "computer"
  ],
  "Navigation": [
    "map",
    "location",
    "pin",
    "gps",
    "compass",
    "globe",
    "route",
    "marker",
    "local"
  ],
  "File": [
    "file",
    "folder",
    "document",
    "archive",
    "paper",
    "copy",
    "paste",
    "clipboard"
  ],
  "Security": [
    "lock",
    "key",
    "shield",
    "guard",
    "protect",
    "secure",
    "password",
    "unlock"
  ],
  "Time": [
    "clock",
    "time",
    "watch",
    "hour",
    "minute",
    "calendar",
    "date",
    "schedule"
  ],
  "Status": [
    "check",
    "cross",
    "x",
    "close",
    "tick",
    "success",
    "warning",
    "error",
    "alert",
    "info",
    "bell",
    "plus",
    "minus",
    "add",
    "remove",
    "delete",
    "clear",
    "cancel",
    "badge"
  ],
  "AI": [
    "ai",
    "robot",
    "bot",
    "sparkle",
    "magic",
    "brain",
    "smart",
    "machine"
  ],
  "Editing": [
    "edit",
    "pencil",
    "pen",
    "write",
    "draw",
    "brush",
    "crop",
    "cut",
    "paint",
    "filter",
    "view",
    "eye",
    "zoom",
    "search",
    "format",
    "layout",
    "list",
    "table",
    "sort",
    "select",
    "line",
    "fill",
    "border"
  ],
  "Characters": [
    "font",
    "text",
    "letter",
    "character",
    "type",
    "bold",
    "italic",
    "heading",
    "language"
  ],
  "Hands": [
    "hand",
    "finger",
    "thumb",
    "point",
    "touch",
    "grab",
    "hold"
  ],
  "Home": [
    "home",
    "house",
    "building",
    "roof",
    "door",
    "nest"
  ],
  "Album": [
    "album",
    "photo",
    "picture",
    "image",
    "gallery"
  ],
  "Camera": [
    "camera",
    "lens",
    "shutter",
    "focus"
  ],
  "Nature": [
    "leaf",
    "tree",
    "plant",
    "flower",
    "forest",
    "wood",
    "bug",
    "animal",
    "water",
    "fire",
    "drop"
  ],
  "Finance": [
    "bank",
    "money",
    "coin",
    "card",
    "credit",
    "dollar",
    "euro",
    "wallet",
    "pay",
    "currency"
  ],
  "Education": [
    "book",
    "school",
    "learn",
    "student",
    "graduate",
    "degree",
    "hat",
    "read",
    "class"
  ],
  "Transport": [
    "car",
    "bus",
    "train",
    "plane",
    "truck",
    "bike",
    "ship",
    "boat",
    "vehicle",
    "auto"
  ],
  "Design": [
    "layer",
    "vector",
    "palette",
    "color",
    "paint",
    "canvas",
    "grid",
    "align",
    "distribute",
    "path"
  ],
  "Commerce": [
    "shop",
    "cart",
    "bag",
    "store",
    "buy",
    "sell",
    "price",
    "tag",
    "basket"
  ],
  "Health": [
    "health",
    "medical",
    "hospital",
    "pill",
    "heart",
    "pulse",
    "doctor",
    "nurse",
    "cross"
  ],
  "Food": [
    "food",
    "drink",
    "cup",
    "coffee",
    "meal",
    "fork",
    "knife",
    "spoon",
    "pizza",
    "burger",
    "apple",
    "dining"
  ],
  "Social": [
    "share",
    "like",
    "thumb",
    "heart",
    "star",
    "network",
    "connect",
    "link"
  ],
  "Brands": [
    "logo",
    "brand",
    "facebook",
    "twitter",
    "google",
    "apple",
    "microsoft",
    "github",
    "amazon"
  ],
  "Sports": [
    "ball",
    "game",
    "sport",
    "play",
    "run",
    "jump",
    "swim",
    "fitness"
  ],
  "Gaming": [
    "game",
    "play",
    "console",
    "controller",
    "joystick",
    "pixel",
    "vr",
    "dice",
    "chess"
  ],
  "Development": [
    "code",
    "bracket",
    "terminal",
    "bug",
    "debug",
    "program",
    "api",
    "server",
    "database",
    "web"
  ],
  "System": [
    "setting",
    "gear",
    "cog",
    "option",
    "config",
    "power",
    "off",
    "on",
    "switch",
    "menu",
    "tool"
  ],
  "Shapes": [
    "circle",
    "square",
    "triangle",
    "rectangle",
    "star",
    "polygon",
    "cube",
    "shape"
  ],
  "Music": [
    "music",
    "note",
    "clef",
    "melody",
    "song",
    "tune"
  ],
  "Travel": [
    "travel",
    "bag",
    "luggage",
    "suitcase",
    "ticket",
    "flight",
    "trip"
  ]
};

export const SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "notification": [
    "bell",
    "alert",
    "message",
    "mail"
  ],
  "alert": [
    "bell",
    "alert-circle",
    "alert-triangle"
  ],
  "ai": [
    "sparkles",
    "bot",
    "brain",
    "cpu"
  ],
  "assistant": [
    "bot",
    "sparkles",
    "brain"
  ],
  "revenue": [
    "dollar-sign",
    "trending-up",
    "bar-chart",
    "pie-chart"
  ],
  "analytics": [
    "bar-chart",
    "pie-chart",
    "activity",
    "trending-up"
  ],
  "dashboard": [
    "grid",
    "layers",
    "bar-chart",
    "activity"
  ],
  "empty": [
    "file",
    "folder",
    "image"
  ],
  "payment": [
    "credit-card",
    "dollar-sign",
    "shopping-cart"
  ],
  "failed": [
    "x",
    "alert-circle",
    "alert-triangle"
  ],
  "chat": [
    "message",
    "mail",
    "send"
  ],
  "person": [
    "user",
    "users"
  ],
  "alarm": [
    "bell",
    "clock"
  ]
};
