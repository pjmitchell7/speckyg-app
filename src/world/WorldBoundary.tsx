import { Component, type ReactNode } from 'react';

export class WorldBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed
    ? <div className="world-fallback"><p>The 3D island could not load. Reload to try again; voice is still available.</p></div>
    : this.props.children;}
}
