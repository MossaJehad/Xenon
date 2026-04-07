import * as bilibili from "./bilibili.js";
import * as bluesky from "./bluesky.js";
import * as dailymotion from "./dailymotion.js";
import * as facebook from "./facebook.js";
import * as instagram from "./instagram.js";
import * as loom from "./loom.js";
import * as newgrounds from "./newgrounds.js";
import * as ok from "./ok.js";
import * as pinterest from "./pinterest.js";
import * as reddit from "./reddit.js";
import * as rutube from "./rutube.js";
import * as snapchat from "./snapchat.js";
import * as soundcloud from "./soundcloud.js";
import * as streamable from "./streamable.js";
import * as tiktok from "./tiktok.js";
import * as tumblr from "./tumblr.js";
import * as twitch from "./twitch.js";
import * as twitter from "./twitter.js";
import * as vimeo from "./vimeo.js";
import * as vk from "./vk.js";
import * as youtube from "./youtube.js";

export const SERVICES = [
    bilibili,
    bluesky,
    dailymotion,
    facebook,
    instagram,
    loom,
    newgrounds,
    ok,
    pinterest,
    reddit,
    rutube,
    snapchat,
    soundcloud,
    streamable,
    tiktok,
    tumblr,
    twitch,
    twitter,
    vimeo,
    vk,
    youtube,
];

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((entry) => [entry.service, entry]));
