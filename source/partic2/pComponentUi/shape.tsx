
import * as React from 'preact'


export namespace SvgShape{
    interface FanProps{
        startAngle:number,
        endAngle:number,
        radius:number,
        cx:number,
        cy:number,
        className?:string,
        fill?:string,
        stroke?:string,
        style?:any
    }
    export class Fan extends React.Component<FanProps>{
        render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
            let startPt=[this.props.cx+Math.cos(this.props.startAngle)*this.props.radius,this.props.cy+Math.sin(this.props.startAngle)*this.props.radius];
            let endPt=[this.props.cx+Math.cos(this.props.endAngle)*this.props.radius,this.props.cy+Math.sin(this.props.endAngle)*this.props.radius];
            let largeArc=(this.props.endAngle-this.props.startAngle)%(Math.PI*2)>Math.PI;
            let pathD=`M ${this.props.cx} ${this.props.cy} L ${startPt.join(' ')} A ${this.props.radius} ${this.props.radius} 0 ${largeArc?1:0} 1 ${endPt.join(' ')}`
            return <path fill={this.props.fill} stroke={this.props.stroke} d={pathD} style={this.props.style}/>
        }
        
    }
}