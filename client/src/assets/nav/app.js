import React, { Component } from 'react';
import './main.css';

import { Link } from 'react-router-dom';
import { gql } from 'apollo-boost';
import { graphql, compose } from 'react-apollo';

import cookieControl from '../../cookieControl';
import links from '../../links';
import { apiPath } from '../../apiPath';

function destroySession() {
  cookieControl.delete("userdata");
  window.location.reload();
}

class NavLink extends Component {
  render() {
    return(
      <React.Fragment>
        <Link className={ `mj-nav-navigation-btn${ (this.props.active) ? " active" : "" }` } to={ this.props.href }>
          { this.props.icon }
        </Link>
      </React.Fragment>
    );
  }
}

class App extends Component {
  constructor(props) {
    super(props);

    this.searchInp = React.createRef();
  }

  componentDidUpdate() {
    if(!this.props.navdata.loading && this.props.navdata.user === null) { // UNSECURE SESSION
      destroySession();
    }
  }

  getAPI = dat => {
    let a = this.props.navdata;
    return ((!a.loading && a.user) || this.props.navdata.user) ? a.user[dat] : "";
  }

  render() {
    return(
      <React.Fragment>
        <div className="mj-nav">
          <div className="mj-nav-navigation">
            {
              [
                {
                  icon: <i className="fas fa-home" />,
                  pageName: links["MAIN_PAGE"]
                },
                {
                  icon: <i className="fas fa-search" />,
                  pageName: links["EXPLORE_PAGE"]
                },
                {
                  icon: <i className="fas fa-bell" />,
                  pageName: links["EVENTS_PAGE"]
                },
                {
                  icon: <i className="fas fa-envelope" />,
                  pageName: links["CHAT_PAGE"]
                }
              ].map((session, index) => {
                return(
                  <NavLink
                    key={ index }
                    href={ session.pageName }
                    icon={ session.icon }
                    active={ window.location.pathname.indexOf(session.pageName) !== -1 }
                  />
                );
              })
            }
          </div>
          <Link
            className="mj-nav-search"
            to={ links["EXPLORE_PAGE"] }>
            <div className="mj-nav-search-icon"><i className="fas fa-search" /></div>
            <input
              className="mj-nav-search-input"
              type="text"
              placeholder="Search"
              ref={ ref => this.searchInp = ref }
              disabled
            />
          </Link>
          <Link
            to={ links["ACCOUNT_PAGE"] }>
            <div className="mj-nav-muser">
              <img
                className="mj-nav-muser-mg"
                src={ this.getAPI("image") ? apiPath + this.getAPI("image") : "" }
                alt={ this.getAPI("name") }
              />
              <span className="mj-nav-muser-tit">
                { this.getAPI("name") }
              </span>
            </div>
          </Link>
        </div>
      </React.Fragment>
    );
  }
}

export default compose(
  graphql(gql`
    query($id: ID!, $login: String!, $password: String!) {
      user(id: $id, login: $login, password: $password) {
        name,
        id,
        image
      }
    }
  `, {
    name: "navdata",
    options: {
      variables: {
        id: cookieControl.get("userdata").id,
        login: cookieControl.get("userdata").login,
        password: cookieControl.get("userdata").password
      }
    }
  })
)(App);
