const Gibberish   = require( 'gibberish-dsp' )
const Ugen        = require( './ugen.js' )
const Instruments = require( './instruments.js' )
const Oscillators = require( './oscillators.js' )
const Effects     = require( './effects.js' )
const Busses      = require( './busses.js' )
const Ensemble    = require( './ensemble.js' )
const Utility     = require( './utility.js' )
const Euclid      = require( './euclid.js' )
const Hex         = require( './hex.js' )
const Freesound   = require( './freesound.js' )

const Audio = {
  Clock: require( './clock.js' ),
  Theory: require( './theory.js' ),

  initialized:false,
  autoConnect:false,
  shouldDelay:false,
  instruments:{},
  oscillators:{},
  effects:{},
  exportTarget:null,

  export( obj ) {
    if( Audio.initialized ){ 
      Object.assign( obj, this.instruments, this.oscillators, this.effects, this.busses )
      
      Utility.export( obj )

      obj.Ensemble = this.Ensemble
      obj.Drums = this.Drums
      obj.EDrums = this.EDrums
      obj.Theory = this.Theory
      obj.Euclid = Euclid( this )
      obj.Hex = Hex( this )
      obj.Freesound = this.Freesound
    }else{
      Audio.exportTarget = obj
    } 
  },

  init( workletPath = './dist/gibberish_worklet.js' ) {
    this.Gibberish = Gibberish

    Gibberish.workletPath = workletPath 

    const p = new Promise( (resolve, reject) => {
      Gibberish.init().then( processorNode => {
        Audio.initialized = true
        Audio.node = processorNode
        Audio.Clock.init()
        Audio.Theory.init( Gibber )
        Audio.Master = Gibberish.out

        Audio.createUgens()
        
        if( Audio.exportTarget !== null ) Audio.export( Audio.exportTarget )

        Gibberish.worklet.port.__postMessage = Gibberish.worklet.port.postMessage

        Gibberish.worklet.port.postMessage = function( dict ) {
          if( Audio.shouldDelay === true ) dict.delay = true

          Gibberish.worklet.port.__postMessage( dict )
        }

        Audio.export( window )

        // XXX this forces the gibberish scheduler to start
        // running, but it's about as hacky as it can get...
        let __start = Gibber.instruments.Synth().connect()
        __start.disconnect()

        resolve()
      })
    })
    
    return p
  },

  // XXX stop clock from being cleared.
  clear() { 
    Gibberish.clear() 
    Audio.Clock.init() //createClock()
    Audio.Seq.clear()
  },

  onload() {},

  createUgens() {
    this.Freesound = Freesound( this )
    this.oscillators = Oscillators.create( this )
    this.instruments = Instruments.create( this ) 
    this.effects = Effects.create( this )
    this.busses = Busses.create( this )
    this.Ensemble = Ensemble( this )
    this.Seq = require( './seq.js' )( this )
    const Pattern = require( './pattern.js' )
    Pattern.transfer( this, Pattern.toString() )
    this.Pattern = Pattern( this )
    
    //console.log( 'pattern string:', Pattern.toString() )

    const drums = require( './drums.js' )( this )
    Object.assign( this, drums )
  },

  addSequencing( obj, methodName ) {

    if( Gibberish.mode === 'worklet' ) {
      obj[ methodName ].sequencers = []

      obj[ methodName ].seq = function( values, timings, number=0, delay=0 ) {
        let prevSeq = obj[ methodName ].sequencers[ number ] 
        if( prevSeq !== undefined ) prevSeq.stop()

        let s = Audio.Seq({ values, timings, target:obj, key:methodName })

        s.start() // Audio.Clock.time( delay ) )
        obj[ methodName ].sequencers[ number ] = obj[ methodName ][ number ] = s 

        // return object for method chaining
        return obj
      }
    }
  },

  printcb() { 
    Gibber.Gibberish.worklet.port.postMessage({ address:'callback' }) 
  },

  // When a property is created, a proxy-ish object is made that is
  // prefaced by a double underscore. This object holds the value of the 
  // property, sequencers for the properyt, and modulations for the property.
  // Alternative getter/setter methods can be passed as arguments.
  createProperty( obj, name, value, post ) {
    obj['__'+name] = { 
      value,
      isProperty:true,
      sequencers:[],
      mods:[],
      name,

      seq( values, timings, number = 0, delay = 0 ) {
        let prevSeq = obj['__'+name].sequencers[ number ] 
        if( prevSeq !== undefined ) { prevSeq.stop(); prevSeq.clear(); }

        // XXX you have to add a method that does all this shit on the worklet. crap.
        obj['__'+name].sequencers[ number ] = obj[ '__'+name ][ number ] = Audio.Seq({ 
          values, 
          timings, 
          target:obj,
          key:name
        })
        .start( Audio.Clock.time( delay ) )

        // return object for method chaining
        return obj
      },
    }

    const getter = () => obj['__'+name]

    const setter = v => {
      obj['__'+name].value = v
      if( Gibberish.mode === 'worklet' ) {
        Gibberish.worklet.port.postMessage({
          address:'property',
          object:obj.id,
          name,
          value:obj['__'+name].value
        }) 
      }
      if( post !== undefined ) {
        post.call( obj )
      }
    }

    Object.defineProperty( obj, name, {
      configurable:true,
      get: getter,
      set: setter
    })



  }
  
}

module.exports = Audio
