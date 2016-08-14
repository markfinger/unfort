"use strict";
const lodash_1 = require('lodash');
function parse5AstDependencies(ast) {
    const identifiers = [];
    const pending = [];
    let node = ast;
    while (node) {
        if (node.childNodes && node.childNodes.length !== 0) {
            pending.push(...node.childNodes);
        }
        switch (node.tagName) {
            case 'script':
            case 'img':
                for (const attr of node.attrs) {
                    if (attr.name === 'src') {
                        if (attr.value) {
                            identifiers.push(attr.value);
                        }
                        break;
                    }
                }
                break;
            case 'link':
                for (const attr of node.attrs) {
                    if (attr.name === 'href') {
                        if (attr.value) {
                            identifiers.push(attr.value);
                        }
                        break;
                    }
                }
                break;
            default:
                break;
        }
        node = pending.pop();
    }
    return {
        identifiers: lodash_1.uniq(identifiers)
    };
}
exports.parse5AstDependencies = parse5AstDependencies;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2U1X2FzdF9kZXBlbmRlbmNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwYXJzZTVfYXN0X2RlcGVuZGVuY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEseUJBQW1CLFFBQVEsQ0FBQyxDQUFBO0FBRTVCLCtCQUFzQyxHQUFRO0lBQzVDLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQztJQUV2QixNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFDbkIsSUFBSSxJQUFJLEdBQUcsR0FBRyxDQUFDO0lBQ2YsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQUNaLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFDRCxNQUFNLENBQUEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN0QixLQUFLLFFBQVEsQ0FBQztZQUNkLEtBQUssS0FBSztnQkFDUixHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUN4QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDZixXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDL0IsQ0FBQzt3QkFDRCxLQUFLLENBQUM7b0JBQ1IsQ0FBQztnQkFDSCxDQUFDO2dCQUNELEtBQUssQ0FBQztZQUNSLEtBQUssTUFBTTtnQkFDVCxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUN6QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzs0QkFDZixXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDL0IsQ0FBQzt3QkFDRCxLQUFLLENBQUM7b0JBQ1IsQ0FBQztnQkFDSCxDQUFDO2dCQUNELEtBQUssQ0FBQztZQUNSO2dCQUNFLEtBQUssQ0FBQztRQUNSLENBQUM7UUFDRCxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxNQUFNLENBQUM7UUFDTCxXQUFXLEVBQUUsYUFBSSxDQUFDLFdBQVcsQ0FBQztLQUMvQixDQUFDO0FBQ0osQ0FBQztBQXhDZSw2QkFBcUIsd0JBd0NwQyxDQUFBIn0=