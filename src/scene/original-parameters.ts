/** Numeric layout facts read from the unencrypted SensMe 1.50 DAT property table.
 * No Sony binary, texture, shader source or executable code is included here.
 * Coordinate interpretation is documented in docs/original-projection.md.
 */
export const ORIGINAL_PARAMETERS = {
 fov:28.5,
 cameraPos:[-6.688,2.78,-24.15],
 cameraRot:[-1,11.2,0],
 front:{position:[1.647,2.5,-10.463],angle:0,alpha:1},
 root:{position:[1.605,2.5,-3.273],angle:0,alpha:1},
 next:{position:[7.221,2.5,9.039],angle:-32,alpha:1,count:12,offset:[3,0,3.4],angleOffset:-6,alphaOffset:-.02},
 previous:{position:[-4.745,2.5,7.643],angle:35,alpha:0},
} as const;
