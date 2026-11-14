/** Set by the Feeds dock's Cari item when it leaves for Explore: the new page focuses its search box. */
let wanted = false;
export const requestSearchFocus = () => {
  wanted = true;
};
export const wantsSearchFocus = () => wanted;
export const clearSearchFocus = () => {
  wanted = false;
};
